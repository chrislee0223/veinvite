begin;

create or replace view public.operator_sybil_v2_policy_reassessment_candidates
with (security_invoker = true)
as
select
  a.invite_code,
  a.network,
  a.policy_version,
  a.state,
  a.source,
  a.updated_at as priority_at
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code = a.invite_code
 and i.activation_network = a.network
left join public.reward_queue_entries q
  on q.invite_code = a.invite_code
where a.source = 'SYSTEM'
  and a.state in ('CLEAR','WATCH','HOLD')
  and i.status = 'COMPLETED'
  and i.reward_status = 'ELIGIBLE'
  and i.reward_eligible_at is not null
  and q.invite_code is null;

revoke all on table public.operator_sybil_v2_policy_reassessment_candidates
  from public, anon, authenticated;
grant select on table public.operator_sybil_v2_policy_reassessment_candidates
  to service_role;

comment on view public.operator_sybil_v2_policy_reassessment_candidates is
  'Service-only unreserved SYSTEM CLEAR/WATCH/HOLD referrals eligible for policy-version reassessment. Including stale SYSTEM HOLD allows a later policy that removes a one-domain HOLD exception to release an obsolete review pause. OPERATOR decisions and reserved rewards remain excluded.';

commit;
