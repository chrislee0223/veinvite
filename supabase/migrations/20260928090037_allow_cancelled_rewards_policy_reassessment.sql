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
where a.source = 'SYSTEM'
  and a.state in ('CLEAR','WATCH','HOLD')
  and i.status = 'COMPLETED'
  and i.reward_status = 'ELIGIBLE'
  and i.reward_eligible_at is not null
  and not exists (
    select 1
    from public.reward_queue_entries q
    where q.invite_code = a.invite_code
      and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
  );

revoke all on table public.operator_sybil_v2_policy_reassessment_candidates
  from public, anon, authenticated;
grant select on table public.operator_sybil_v2_policy_reassessment_candidates
  to service_role;

comment on view public.operator_sybil_v2_policy_reassessment_candidates is
  'Service-only SYSTEM CLEAR/WATCH/HOLD referrals eligible for policy-version reassessment when no active reward liability exists. CANCELLED queue rows do not block reassessment; active AWAITING_CLAIM/QUEUED/ASSIGNED rewards remain excluded.';

commit;
