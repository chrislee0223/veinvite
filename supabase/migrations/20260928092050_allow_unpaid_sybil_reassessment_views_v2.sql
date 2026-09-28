begin;

create or replace view public.operator_sybil_v2_assessment_candidates
with (security_invoker = true)
as
with newest_network_evidence as (
  select network, max(observed_at) as newest_evidence_at
  from (
    select network, created_at as observed_at from public.sybil_v2_evidence_records
    union all
    select network, created_at from public.sybil_v2_historical_reward_events
    union all
    select network, created_at from public.sybil_v2_preactivation_b3tr_outflows
    union all
    select network, detected_at from public.invite_impact_events
    where detected_at is not null
  ) evidence
  group by network
)
select
  i.invite_code,
  i.activation_network as network,
  i.reward_eligible_at,
  a.state as assessment_state,
  a.revision as assessment_revision,
  a.source as assessment_source,
  c.id as current_clearance_id,
  coalesce(a.updated_at,i.reward_eligible_at,i.updated_at) as priority_at,
  greatest(
    coalesce(n.newest_evidence_at,'-infinity'::timestamptz),
    coalesce(i.identity_link_checked_at,'-infinity'::timestamptz)
  ) as newest_relevant_evidence_at
from public.invitations i
left join public.sybil_v2_referral_assessments a
  on a.invite_code=i.invite_code
left join public.sybil_v2_reward_clearances c
  on c.invite_code=i.invite_code
 and c.assessment_revision=a.revision
 and c.verdict=a.state
left join newest_network_evidence n
  on n.network=i.activation_network
where i.status='COMPLETED'
  and i.reward_status='ELIGIBLE'
  and i.reward_eligible_at is not null
  and coalesce(a.state,'') not in ('HOLD','RESTRICTED')
  and not exists (
    select 1 from public.reward_queue_entries q
    where q.invite_code=i.invite_code
      and q.status='ASSIGNED'
  )
  and (
    c.id is null
    or a.updated_at is null
    or greatest(
      coalesce(n.newest_evidence_at,'-infinity'::timestamptz),
      coalesce(i.identity_link_checked_at,'-infinity'::timestamptz)
    ) > a.updated_at
  );

revoke all on table public.operator_sybil_v2_assessment_candidates
  from public, anon, authenticated;
grant select on table public.operator_sybil_v2_assessment_candidates
  to service_role;

create or replace view public.operator_sybil_v2_policy_reassessment_candidates
with (security_invoker = true)
as
select
  a.invite_code,a.network,a.policy_version,a.state,a.source,
  a.updated_at as priority_at
from public.sybil_v2_referral_assessments a
join public.invitations i
  on i.invite_code=a.invite_code
 and i.activation_network=a.network
where a.source='SYSTEM'
  and a.state in ('CLEAR','WATCH','HOLD')
  and i.status='COMPLETED'
  and i.reward_status='ELIGIBLE'
  and i.reward_eligible_at is not null
  and not exists (
    select 1 from public.reward_queue_entries q
    where q.invite_code=a.invite_code
      and q.status='ASSIGNED'
  );

revoke all on table public.operator_sybil_v2_policy_reassessment_candidates
  from public, anon, authenticated;
grant select on table public.operator_sybil_v2_policy_reassessment_candidates
  to service_role;

commit;
