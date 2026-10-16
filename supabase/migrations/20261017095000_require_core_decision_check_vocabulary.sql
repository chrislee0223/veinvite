-- Fail closed when a historical/malformed HOLD has an empty or incomplete
-- required_checks array: [] <@ [] must not authorize operator CLEAR.
-- Keep existing rule that CHAIN_FINALITY is allowed to remain incomplete
-- before voting; never relax rewards, wallet or security restrictions.
create or replace function public.guard_sybil_v2_operator_decision_readiness()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
begin
  if new.source = 'OPERATOR'
     and old.state = 'HOLD'
     and new.state = 'CLEAR'
     and (
       not (
         '["HISTORICAL_CHAIN","FUNDING_CHAIN","MISSION_BEHAVIOR","SECURITY_IDENTITY","VEPASSPORT"]'::jsonb
         <@ coalesce(old.required_checks, '[]'::jsonb)
       )
       or not (
         (coalesce(old.required_checks, '[]'::jsonb) - 'CHAIN_FINALITY')
         <@ coalesce(old.completed_checks, '[]'::jsonb)
       )
     ) then
    raise exception 'SYBIL_V2_CLEAR_CHECKS_INCOMPLETE';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_sybil_v2_operator_decision_readiness()
from public, anon, authenticated;

comment on function public.guard_sybil_v2_operator_decision_readiness() is
  'Early HOLD operator CLEAR requires five named core checks declared and completed, plus all other non-finality required checks. Empty required_checks fails closed; CHAIN_FINALITY remains optional pre-vote.';
