begin;

create or replace function public.enrich_operator_monitor_snapshot_sybil_v2_historical_watch()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_watch_count bigint := 0;
  v_oldest_watch_at timestamptz := null;
  v_latest_watch_at timestamptz := null;
begin
  if not public.sybil_v2_enforcement_enabled() then
    new.metrics := coalesce(new.metrics,'{}'::jsonb) ||
      jsonb_build_object(
        'sybilV2HistoricalWatch',
        jsonb_build_object(
          'mode','SHADOW',
          'enforcementEnabled',false
        )
      );
    return new;
  end if;

  select
    count(*)::bigint,
    min(w.watch_updated_at),
    max(w.watch_updated_at)
  into
    v_watch_count,
    v_oldest_watch_at,
    v_latest_watch_at
  from public.operator_sybil_v2_historical_watch_followups w
  where w.network = new.network;

  new.metrics := coalesce(new.metrics,'{}'::jsonb) ||
    jsonb_build_object(
      'sybilV2HistoricalWatch',
      jsonb_build_object(
        'watchReferrals', v_watch_count,
        'oldestWatchAt', v_oldest_watch_at,
        'latestWatchAt', v_latest_watch_at,
        'followupMode', 'AUTOMATIC_SAME_SUBJECT_REVIEW',
        'followupHorizonsHours', jsonb_build_array(24,168,720),
        'rewardRecipientEvidenceCombined', false
      )
    );

  return new;
end;
$$;

revoke all on function public.enrich_operator_monitor_snapshot_sybil_v2_historical_watch()
  from public, anon, authenticated, service_role;

comment on function public.enrich_operator_monitor_snapshot_sybil_v2_historical_watch() is
  'Adds historical Sybil v2 WATCH counts to operator monitor snapshots. Follow-up is automatic at 24h, 7d, and 30d and remains scoped to the WATCH invitee; inviter reward-recipient evidence is never combined.';

commit;
