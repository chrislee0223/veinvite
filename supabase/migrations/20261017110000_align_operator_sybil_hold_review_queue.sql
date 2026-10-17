-- Adjust read-only operator views only. No verdicts, wallets or rewards changed.
-- Keep existing view ACLs and invoker-security settings.
create or replace view public.operator_sybil_v2_operator_action_candidates
with (security_invoker = true) as
select a.*,
  coalesce(
    (select min(e.created_at)
     from public.sybil_v2_assessment_events e
     where e.invite_code = a.invite_code
       and e.network = a.network
       and e.state = 'HOLD'
       and e.revision > coalesce(
         (select max(prior.revision)
          from public.sybil_v2_assessment_events prior
          where prior.invite_code = a.invite_code
            and prior.network = a.network
            and prior.state <> 'HOLD'), 0)
    ), a.assessed_at) as first_held_at
from public.sybil_v2_referral_assessments a
where public.sybil_v2_enforcement_enabled() and a.state = 'HOLD';

create or replace view public.operator_sybil_v2_manual_review_candidates
with (security_invoker = true) as
select a.*
from public.sybil_v2_referral_assessments a
where public.sybil_v2_enforcement_enabled() and a.state = 'HOLD'
  and '["HISTORICAL_CHAIN","FUNDING_CHAIN","MISSION_BEHAVIOR","SECURITY_IDENTITY","VEPASSPORT"]'::jsonb
      <@ coalesce(a.required_checks,'[]'::jsonb)
  and (coalesce(a.required_checks,'[]'::jsonb) - 'CHAIN_FINALITY')
      <@ coalesce(a.completed_checks,'[]'::jsonb);
