begin;

create or replace view public.operator_sybil_v2_operator_action_candidates
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

comment on view public.operator_sybil_v2_operator_action_candidates is
  'Service-only current Sybil v2 HOLD referrals visible to the operator. Early HOLDs may be BLACKLISTED immediately; CLEAR remains gated on completion of core decision checks.';

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
       (
         coalesce(old.required_checks,'[]'::jsonb)
         - 'CHAIN_FINALITY'
       )
       <@ coalesce(old.completed_checks,'[]'::jsonb)
     ) then
    raise exception 'SYBIL_V2_CLEAR_CHECKS_INCOMPLETE';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_sybil_v2_operator_decision_readiness()
from public, anon, authenticated;

comment on function public.guard_sybil_v2_operator_decision_readiness() is
  'Allows an operator to BLACKLIST a current HOLD before later mission/finality checks complete, while preventing CLEAR until all core Sybil decision checks except CHAIN_FINALITY are complete.';

commit;
