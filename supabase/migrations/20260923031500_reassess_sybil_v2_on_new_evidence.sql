begin;

-- A referral that was CLEAR/WATCH before another related wallet arrived must be
-- reassessed while it is still pre-Claim. This view re-opens only unreserved
-- referrals when newer network evidence exists. Once a reward_queue row exists,
-- the immutable Claim boundary wins and the referral is intentionally excluded.
create or replace view public.operator_sybil_v2_assessment_candidates
with (security_invoker = true)
as
with newest_network_evidence as (
  select network, max(observed_at) as newest_evidence_at
  from (
    select e.network, e.created_at as observed_at
    from public.sybil_v2_evidence_records e

    union all

    select h.network, h.created_at as observed_at
    from public.sybil_v2_historical_reward_events h

    union all

    select o.network, o.created_at as observed_at
    from public.sybil_v2_preactivation_b3tr_outflows o

    union all

    select e.network, e.detected_at as observed_at
    from public.invite_impact_events e
    where e.detected_at is not null
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
  greatest(
    coalesce(n.newest_evidence_at, '-infinity'::timestamptz),
    coalesce(i.identity_link_checked_at, '-infinity'::timestamptz)
  ) as newest_relevant_evidence_at,
  coalesce(a.updated_at, i.reward_eligible_at, i.updated_at) as priority_at
from public.invitations i
left join public.sybil_v2_referral_assessments a
  on a.invite_code = i.invite_code
left join public.sybil_v2_reward_clearances c
  on c.invite_code = i.invite_code
 and c.assessment_revision = a.revision
 and c.verdict = a.state
left join public.reward_queue_entries q
  on q.invite_code = i.invite_code
left join newest_network_evidence n
  on n.network = i.activation_network
where i.status = 'COMPLETED'
  and i.reward_status = 'ELIGIBLE'
  and i.reward_eligible_at is not null
  and q.invite_code is null
  and coalesce(a.state, '') not in ('HOLD','RESTRICTED')
  and (
    c.id is null
    or a.updated_at is null
    or greatest(
      coalesce(n.newest_evidence_at, '-infinity'::timestamptz),
      coalesce(i.identity_link_checked_at, '-infinity'::timestamptz)
    ) > a.updated_at
  );

comment on view public.operator_sybil_v2_assessment_candidates is
  'Unreserved reward-eligible referrals that lack a current clearance or gained newer cluster/mission/security evidence after their last Sybil v2 assessment. Claim-ready queue rows are excluded by design.';

revoke all on public.operator_sybil_v2_assessment_candidates
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_assessment_candidates
  to service_role;

commit;
