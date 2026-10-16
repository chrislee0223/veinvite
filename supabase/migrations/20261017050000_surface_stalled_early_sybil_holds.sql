-- Make early Sybil v2 HOLDs operationally visible before mission completion.
-- This is notification-only: it never clears, restricts, pays or changes
-- existing operator decision gates. Avoid treating chain finality (which is
-- expected to be incomplete before voting) as a decision-check deadlock.

create or replace function public.enrich_operator_monitor_snapshot_sybil_v2_hold_liveness()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_open bigint := 0;
  v_incomplete_core bigint := 0;
  v_incomplete_over_1h bigint := 0;
  v_incomplete_over_24h bigint := 0;
  v_extra_alerts jsonb := '[]'::jsonb;
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  select
    count(*)::bigint,
    count(*) filter (
      where not (
        (coalesce(a.required_checks, '[]'::jsonb) - 'CHAIN_FINALITY')
        <@ coalesce(a.completed_checks, '[]'::jsonb)
      )
    )::bigint,
    count(*) filter (
      where not (
        (coalesce(a.required_checks, '[]'::jsonb) - 'CHAIN_FINALITY')
        <@ coalesce(a.completed_checks, '[]'::jsonb)
      )
      and a.assessed_at < v_now - interval '1 hour'
    )::bigint,
    count(*) filter (
      where not (
        (coalesce(a.required_checks, '[]'::jsonb) - 'CHAIN_FINALITY')
        <@ coalesce(a.completed_checks, '[]'::jsonb)
      )
      and a.assessed_at < v_now - interval '24 hours'
    )::bigint
  into
    v_open, v_incomplete_core, v_incomplete_over_1h,
    v_incomplete_over_24h
  from public.operator_sybil_v2_operator_action_candidates a
  where a.network = new.network;

  new.metrics := coalesce(new.metrics, '{}'::jsonb)
    || jsonb_build_object(
      'sybilV2HoldLiveness',
      jsonb_build_object(
        'operatorVisibleHolds', v_open,
        'incompleteCoreChecks', v_incomplete_core,
        'incompleteOver1h', v_incomplete_over_1h,
        'incompleteOver24h', v_incomplete_over_24h,
        'warningAfterHours', 1,
        'criticalAfterHours', 24
      )
    );

  -- Existing operator review alert is preserved. Add explicit escalation
  -- only for stalled early-HOLDs whose core checks are still incomplete.
  if v_incomplete_over_24h > 0 then
    v_extra_alerts := jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_EARLY_HOLD_STALLED_OVER_24H',
        'severity', 'CRITICAL',
        'observed', v_incomplete_over_24h,
        'message', 'Early Sybil HOLDs are over 24 hours old with incomplete core checks. Operator must investigate the evidence/review deadlock; do not auto-clear or auto-blacklist.'
      )
    );
  elsif v_incomplete_over_1h > 0 then
    v_extra_alerts := jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_EARLY_HOLD_STALLED_OVER_1H',
        'severity', 'WARNING',
        'observed', v_incomplete_over_1h,
        'message', 'Early Sybil HOLDs are over one hour old with incomplete core checks. Operator review or investigation is required.'
      )
    );
  end if;

  new.alerts := coalesce(new.alerts, '[]'::jsonb) || v_extra_alerts;
  new.alert_count := jsonb_array_length(new.alerts);
  new.severity := case
    when new.alerts @> '[{"severity":"CRITICAL"}]'::jsonb then 'CRITICAL'
    when new.alert_count > 0 then 'WARNING'
    else 'NORMAL'
  end;
  return new;
end;
$function$;

-- Runs just after the existing Sybil v2 enrichment, before the other
-- review/cron enrichments; does not alter or replace any existing triggers.
drop trigger if exists aa_operator_monitor_sybil_v2_hold_liveness
  on public.operator_monitor_snapshots;
create trigger aa_operator_monitor_sybil_v2_hold_liveness
before insert on public.operator_monitor_snapshots
for each row
execute function public.enrich_operator_monitor_snapshot_sybil_v2_hold_liveness();
