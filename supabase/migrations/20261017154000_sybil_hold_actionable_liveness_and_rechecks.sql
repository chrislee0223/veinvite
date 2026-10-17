-- Align Sybil HOLD reliability alerts with actionable assessment work.
-- This migration is observational only: no verdict, restriction, reward or payout is changed.
-- New HIGH/MEDIUM evidence is prioritized for an ordinary SYSTEM HOLD reassessment;
-- old operator decisions and PAID/FORFEITED cases remain outside the recheck queue.

create or replace view public.operator_sybil_v2_hold_new_evidence_candidates
with (security_invoker = true) as
select
  a.invite_code,
  a.network,
  fresh.created_at as priority_at
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code = a.invite_code
 and i.activation_network = a.network
join lateral (
  select e.created_at
  from public.sybil_v2_evidence_records e
  where e.invite_code = a.invite_code
    and e.network = a.network
    and e.subject_wallet = lower(i.invitee_wallet)
    and e.created_at > a.updated_at
    and e.strength in ('MEDIUM', 'HIGH')
    and e.score > 0
    -- Avoid indefinite rechecks of evidence already represented by the verdict.
    and not (coalesce(a.reason_codes, '[]'::jsonb) ? e.signal_code)
  order by e.created_at asc
  limit 1
) fresh on true
where public.sybil_v2_enforcement_enabled()
  and a.state = 'HOLD'
  and a.source = 'SYSTEM'
  and i.invitee_wallet is not null
  and i.status in ('ACTIVATING', 'UNDER_REVIEW', 'COMPLETED')
  and i.reward_status not in ('PAID', 'FORFEITED')
  and not exists (
    select 1 from public.reward_queue_entries q
    where q.invite_code = a.invite_code
      and q.status = 'ASSIGNED'
  );

revoke all on public.operator_sybil_v2_hold_new_evidence_candidates
from public, anon, authenticated;
grant select on public.operator_sybil_v2_hold_new_evidence_candidates
to service_role;

comment on view public.operator_sybil_v2_hold_new_evidence_candidates is
  'Private, read-only SYSTEM HOLDs with newly observed, previously unrepresented medium/high evidence. Never overrides an operator decision.';

-- Preserve the existing four-column RPC contract and service-role-only ACL.
-- Count all open HOLDs for the operator, but only call a HOLD "stalled"
-- when a runnable decision check is actually waiting: completed core checks,
-- completed immutable missions, failed evidence scan, or new strong evidence.
create or replace function public.read_sybil_v2_early_hold_liveness(
  p_network text
)
returns table(
  open_holds bigint,
  incomplete_core_holds bigint,
  stalled_over_1h bigint,
  stalled_over_24h bigint
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  with active_episodes as (
    select
      a.invite_code,
      not (
        (coalesce(a.required_checks, '[]'::jsonb) - 'CHAIN_FINALITY')
        <@ coalesce(a.completed_checks, '[]'::jsonb)
      ) as incomplete_core,
      coalesce(a.first_held_at, a.assessed_at) as first_held_at,
      (
        a.source = 'OPERATOR'
        or i.invite_code is null
        or (
          -- The user actually completed the full immutable mission;
          -- merely ACTIVATING or a partial dApp attempt is NOT stalled.
          coalesce(i.apps_completed, 0) >= 3
          and coalesce(i.rewards_received, 0) >= 3
          and i.vot3_converted is true
          and i.vote_completed is true
          and i.activation_block is not null
          and i.apps_completed_block is not null
          and i.vot3_converted_block is not null
          and i.vote_completed_block is not null
        )
        or (
          -- A ready core decision is actionable even before on-chain finality.
          '["HISTORICAL_CHAIN","FUNDING_CHAIN","MISSION_BEHAVIOR","SECURITY_IDENTITY","VEPASSPORT"]'::jsonb
          <@ coalesce(a.completed_checks, '[]'::jsonb)
        )
        or exists (
          select 1 from public.sybil_v2_scan_checkpoints s
          where s.invite_code = a.invite_code
            and s.network = a.network
            and s.attempt_count >= 3
            and s.last_error is not null
        )
        or exists (
          select 1 from public.operator_sybil_v2_hold_new_evidence_candidates e
          where e.invite_code = a.invite_code
            and e.network = a.network
        )
      ) as needs_action
    from public.operator_sybil_v2_operator_action_candidates a
    left join public.invitations i
      on i.invite_code = a.invite_code and i.activation_network = a.network
    where a.network = lower(btrim(p_network))
  )
  select
    count(*)::bigint,
    count(*) filter (where incomplete_core)::bigint,
    count(*) filter (
      where needs_action and first_held_at <= now() - interval '1 hour'
    )::bigint,
    count(*) filter (
      where needs_action and first_held_at <= now() - interval '24 hours'
    )::bigint
  from active_episodes;
$function$;

revoke all on function public.read_sybil_v2_early_hold_liveness(text)
from public, anon, authenticated;
grant execute on function public.read_sybil_v2_early_hold_liveness(text)
to service_role;

comment on function public.read_sybil_v2_early_hold_liveness(text) is
  'Report all HOLDs, but escalate delay only when an actionable Sybil decision/evidence check is actually due. Partial pre-mission HOLD is not an analyzer outage.';

-- Use the SAME definition of actionable stall for both monitoring paths.
-- This prevents 15-minute reliability and daily operator snapshots disagreeing.
create or replace function public.enrich_operator_monitor_snapshot_sybil_v2_hold_liveness()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_open bigint := 0;
  v_incomplete_core bigint := 0;
  v_over_1h bigint := 0;
  v_over_24h bigint := 0;
  v_extra_alerts jsonb := '[]'::jsonb;
begin
  if not public.sybil_v2_enforcement_enabled() then
    return new;
  end if;

  select open_holds, incomplete_core_holds, stalled_over_1h, stalled_over_24h
  into v_open, v_incomplete_core, v_over_1h, v_over_24h
  from public.read_sybil_v2_early_hold_liveness(new.network);

  new.metrics := coalesce(new.metrics, '{}'::jsonb)
    || jsonb_build_object(
      'sybilV2HoldLiveness',
      jsonb_build_object(
        'operatorVisibleHolds', v_open,
        'incompleteCoreChecks', v_incomplete_core,
        'incompleteOver1h', v_over_1h,
        'incompleteOver24h', v_over_24h,
        'warningAfterHours', 1,
        'criticalAfterHours', 24,
        'alertBasis', 'ACTIONABLE_EVIDENCE_OR_COMPLETED_MISSIONS'
      )
    );

  if v_over_24h > 0 then
    v_extra_alerts := jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_EARLY_HOLD_STALLED_OVER_24H',
        'severity', 'CRITICAL',
        'observed', v_over_24h,
        'message', 'Actionable Sybil HOLD checks have remained unresolved for over 24 hours. Investigate the decision or evidence recheck path; never auto-clear or auto-blacklist without proof.'
      )
    );
  elsif v_over_1h > 0 then
    v_extra_alerts := jsonb_build_array(
      jsonb_build_object(
        'code', 'SYBIL_V2_EARLY_HOLD_STALLED_OVER_1H',
        'severity', 'WARNING',
        'observed', v_over_1h,
        'message', 'Actionable Sybil HOLD evidence or decision checks are unresolved after one hour.'
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

comment on function public.enrich_operator_monitor_snapshot_sybil_v2_hold_liveness() is
  'Use the same actionable-HOLD health reader for operator snapshots and reliability, without mutating any Sybil decisions.';
