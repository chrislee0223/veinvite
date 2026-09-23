begin;

create or replace view public.operator_sybil_v2_temporary_participation_holds
with (security_invoker = true)
as
select
  ('preclaim:' || a.invite_code || ':inviter')::text as id,
  a.network,
  lower(i.inviter_wallet) as wallet_address,
  'PRE_CLAIM_HOLD'::text as restriction_kind,
  a.reason_codes,
  a.evidence_summary,
  a.invite_code as related_invite_code,
  a.updated_at as imposed_at
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code = a.invite_code
where public.sybil_v2_enforcement_enabled()
  and a.state = 'HOLD'
  and i.inviter_wallet is not null

union all

select
  ('preclaim:' || a.invite_code || ':invitee')::text as id,
  a.network,
  lower(i.invitee_wallet) as wallet_address,
  'PRE_CLAIM_HOLD'::text as restriction_kind,
  a.reason_codes,
  a.evidence_summary,
  a.invite_code as related_invite_code,
  a.updated_at as imposed_at
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code = a.invite_code
where public.sybil_v2_enforcement_enabled()
  and a.state = 'HOLD'
  and i.invitee_wallet is not null

union all

select
  ('postpayout:' || r.invite_code || ':recipient')::text as id,
  r.network,
  lower(r.subject_wallet) as wallet_address,
  'POST_PAYOUT_HOLD'::text as restriction_kind,
  r.reason_codes,
  r.evidence_summary,
  r.invite_code as related_invite_code,
  r.updated_at as imposed_at
from public.sybil_v2_post_payout_reviews r
where public.sybil_v2_enforcement_enabled()
  and r.state = 'HOLD';

revoke all on public.operator_sybil_v2_temporary_participation_holds
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_temporary_participation_holds
  to service_role;

comment on view public.operator_sybil_v2_temporary_participation_holds is
  'Service-only temporary participation block list. PRE_CLAIM HOLD blocks both referral parties from starting new VeInvite activity while review is pending; POST_PAYOUT HOLD blocks only the already-paid reward recipient. No past reward is changed.';

create or replace function public.enrich_operator_monitor_snapshot_sybil_v2_post_payout()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_post_hold bigint := 0;
  v_post_hold_over_24h bigint := 0;
  v_post_hold_over_48h bigint := 0;
  v_bridge_backlog bigint := 0;
  v_stale_bridge bigint := 0;
  v_extra_alerts jsonb := '[]'::jsonb;
  v_extra_metrics jsonb := '{}'::jsonb;
begin
  if not public.sybil_v2_enforcement_enabled() then
    new.metrics := coalesce(new.metrics,'{}'::jsonb) ||
      jsonb_build_object(
        'sybilV2PostPayout',
        jsonb_build_object(
          'mode','SHADOW',
          'enforcementEnabled',false
        )
      );
    return new;
  end if;

  select count(*)::bigint
  into v_post_hold
  from public.sybil_v2_post_payout_reviews r
  where r.network = new.network
    and r.state = 'HOLD';

  select count(*)::bigint
  into v_post_hold_over_24h
  from public.sybil_v2_post_payout_reviews r
  where r.network = new.network
    and r.state = 'HOLD'
    and r.opened_at < clock_timestamp() - interval '24 hours';

  select count(*)::bigint
  into v_post_hold_over_48h
  from public.sybil_v2_post_payout_reviews r
  where r.network = new.network
    and r.state = 'HOLD'
    and r.opened_at < clock_timestamp() - interval '48 hours';

  select count(*)::bigint
  into v_bridge_backlog
  from public.operator_sybil_v2_post_payout_candidates c
  where c.network = new.network;

  select count(*)::bigint
  into v_stale_bridge
  from public.operator_sybil_v2_post_payout_candidates c
  where c.network = new.network
    and c.checked_at < clock_timestamp() - interval '15 minutes';

  v_extra_metrics := jsonb_build_object(
    'sybilV2PostPayout',
    jsonb_build_object(
      'holdReviews', v_post_hold,
      'holdReviewsOver24h', v_post_hold_over_24h,
      'holdReviewsOver48h', v_post_hold_over_48h,
      'bridgeBacklog', v_bridge_backlog,
      'staleBridgeBacklog', v_stale_bridge,
      'bridgeStaleThresholdMinutes', 15,
      'reviewWarningHours', 24,
      'reviewCriticalHours', 48
    )
  );

  if v_stale_bridge > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_POST_PAYOUT_BRIDGE_STALE',
        'severity', 'CRITICAL',
        'observed', v_stale_bridge,
        'message', 'One or more finalized B3TR observations have waited over 15 minutes to enter the Sybil v2 evidence/review pipeline.'
      )
    );
  end if;

  if v_post_hold > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_POST_PAYOUT_REVIEW_REQUIRED',
        'severity', 'WARNING',
        'observed', v_post_hold,
        'message', 'One or more already-paid reward recipients have new post-payout evidence requiring operator review. Past rewards remain unchanged; future participation is temporarily held.'
      )
    );
  end if;

  if v_post_hold_over_48h > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_POST_PAYOUT_REVIEW_OVER_48H',
        'severity', 'CRITICAL',
        'observed', v_post_hold_over_48h,
        'message', 'A post-payout Sybil v2 HOLD has remained unresolved for over 48 hours.'
      )
    );
  elsif v_post_hold_over_24h > 0 then
    v_extra_alerts := v_extra_alerts || jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_POST_PAYOUT_REVIEW_OVER_24H',
        'severity', 'WARNING',
        'observed', v_post_hold_over_24h,
        'message', 'A post-payout Sybil v2 HOLD has remained unresolved for over 24 hours.'
      )
    );
  end if;

  new.metrics := coalesce(new.metrics,'{}'::jsonb) || v_extra_metrics;
  new.alerts := coalesce(new.alerts,'[]'::jsonb) || v_extra_alerts;
  new.alert_count := jsonb_array_length(new.alerts);
  new.severity := case
    when new.alerts @> '[{"severity":"CRITICAL"}]'::jsonb then 'CRITICAL'
    when new.alert_count > 0 then 'WARNING'
    else 'NORMAL'
  end;

  return new;
end;
$$;

revoke all on function public.enrich_operator_monitor_snapshot_sybil_v2_post_payout()
  from public, anon, authenticated, service_role;

drop trigger if exists ab_operator_monitor_sybil_v2_post_payout_enrichment
  on public.operator_monitor_snapshots;
create trigger ab_operator_monitor_sybil_v2_post_payout_enrichment
before insert on public.operator_monitor_snapshots
for each row execute function public.enrich_operator_monitor_snapshot_sybil_v2_post_payout();

commit;
