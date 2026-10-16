-- QA-ONLY reviewed schema slice for Sybil v2 pre-claim HOLD tests.
-- NOT a Production migration: never place this file in supabase/migrations.
-- Production already has these database objects. QA is on a divergent
-- historical migration lineage; this adds only missing service-side checks.
-- No user, wallet, referral, reward, X promotion or live signer data is copied.

create view public.operator_sybil_v2_operator_action_candidates
with (security_invoker = true)
as
select a.*
from public.sybil_v2_referral_assessments a
where public.sybil_v2_enforcement_enabled()
  and a.state = 'HOLD';

revoke all on public.operator_sybil_v2_operator_action_candidates
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_operator_action_candidates
  to service_role;

create view public.operator_sybil_v2_manual_review_candidates
with (security_invoker = true)
as
select a.*
from public.sybil_v2_referral_assessments a
where public.sybil_v2_enforcement_enabled()
  and a.state = 'HOLD'
  and coalesce(a.required_checks, '[]'::jsonb)
    <@ coalesce(a.completed_checks, '[]'::jsonb);

revoke all on public.operator_sybil_v2_manual_review_candidates
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_manual_review_candidates
  to service_role;

create or replace function public.guard_sybil_v2_operator_decision_readiness()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
begin
  if new.source = 'OPERATOR'
     and old.state = 'HOLD'
     and new.state = 'CLEAR'
     and not (
       (coalesce(old.required_checks,'[]'::jsonb) - 'CHAIN_FINALITY')
       <@ coalesce(old.completed_checks,'[]'::jsonb)
     ) then
    raise exception 'SYBIL_V2_CLEAR_CHECKS_INCOMPLETE';
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_sybil_v2_operator_decision_readiness()
  from public, anon, authenticated;

create trigger sybil_v2_operator_decision_readiness_guard
before update on public.sybil_v2_referral_assessments
for each row
execute function public.guard_sybil_v2_operator_decision_readiness();

-- Share the exact, aggregate-only Production inspection logic, but only in QA.
create or replace function public.read_sybil_v2_early_hold_liveness(
  p_network text
)
returns table (
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
      coalesce(
        (
          select min(h.created_at)
          from public.sybil_v2_assessment_events h
          where h.invite_code = a.invite_code
            and h.network = a.network
            and h.state = 'HOLD'
            and h.revision > coalesce(
              (
                select max(previous.revision)
                from public.sybil_v2_assessment_events previous
                where previous.invite_code = a.invite_code
                  and previous.network = a.network
                  and previous.state <> 'HOLD'
              ), 0
            )
        ),
        a.assessed_at
      ) as first_held_at
    from public.operator_sybil_v2_operator_action_candidates a
    where a.network = lower(btrim(p_network))
  )
  select
    count(*)::bigint,
    count(*) filter (where incomplete_core)::bigint,
    count(*) filter (
      where first_held_at <= now() - interval '1 hour'
    )::bigint,
    count(*) filter (
      where first_held_at <= now() - interval '24 hours'
    )::bigint
  from active_episodes;
$function$;

revoke all on function public.read_sybil_v2_early_hold_liveness(text)
  from public, anon, authenticated;
grant execute on function public.read_sybil_v2_early_hold_liveness(text)
  to service_role;

comment on view public.operator_sybil_v2_operator_action_candidates is
  'QA partial parity: current HOLDs are visible to operators even before missions.';
comment on function public.read_sybil_v2_early_hold_liveness(text) is
  'QA aggregate-only Sybil early-HOLD monitoring, matching Production. No wallet identifiers returned.';
