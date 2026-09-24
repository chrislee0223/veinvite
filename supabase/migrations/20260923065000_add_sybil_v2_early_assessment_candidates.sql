begin;

create or replace view public.operator_sybil_v2_early_assessment_candidates
with (security_invoker = true)
as
select
  i.invite_code,
  i.activation_network as network,
  i.status,
  i.reward_status,
  i.activated_at,
  a.state as assessment_state,
  a.revision as assessment_revision,
  a.source as assessment_source,
  coalesce(
    a.updated_at,
    i.activated_at,
    i.updated_at
  ) as priority_at,
  freshness.newest_relevant_evidence_at
from public.invitations i
join public.sybil_v2_scan_checkpoints s
  on s.invite_code = i.invite_code
 and s.network = i.activation_network
 and s.historical_chain_status = 'COMPLETE'
 and s.funding_chain_status = 'COMPLETE'
left join public.sybil_v2_referral_assessments a
  on a.invite_code = i.invite_code
left join public.reward_queue_entries q
  on q.invite_code = i.invite_code
left join lateral (
  select greatest(
    coalesce(s.updated_at, '-infinity'::timestamptz),

    coalesce((
      select max(e.created_at)
      from public.sybil_v2_evidence_records e
      where e.invite_code = i.invite_code
        and e.network = i.activation_network
        and e.evidence_family in (
          'FUNDING',
          'HISTORICAL_REWARD',
          'HISTORICAL_CONSOLIDATION',
          'CLUSTER_LINK'
        )
    ), '-infinity'::timestamptz),

    coalesce((
      select max(peer.created_at)
      from public.sybil_v2_historical_reward_events own
      join public.sybil_v2_historical_reward_events peer
        on peer.network = own.network
       and peer.app_id = own.app_id
      where own.invite_code = i.invite_code
        and own.network = i.activation_network
    ), '-infinity'::timestamptz),

    coalesce((
      select max(peer.created_at)
      from public.sybil_v2_preactivation_b3tr_outflows own
      join public.sybil_v2_preactivation_b3tr_outflows peer
        on peer.network = own.network
       and peer.destination_wallet = own.destination_wallet
      where own.invite_code = i.invite_code
        and own.network = i.activation_network
    ), '-infinity'::timestamptz),

    coalesce((
      select max(peer.created_at)
      from public.sybil_v2_evidence_records own
      join public.sybil_v2_evidence_records peer
        on peer.network = own.network
       and peer.related_wallet = own.related_wallet
       and peer.related_wallet is not null
      where own.invite_code = i.invite_code
        and own.network = i.activation_network
        and own.evidence_family in ('FUNDING','CLUSTER_LINK')
        and peer.evidence_family in ('FUNDING','CLUSTER_LINK')
    ), '-infinity'::timestamptz)
  ) as newest_relevant_evidence_at
) freshness on true
where i.activation_network is not null
  and i.invitee_wallet is not null
  and i.activated_at is not null
  and i.status in ('ACTIVATING','UNDER_REVIEW','COMPLETED')
  and i.reward_status in ('NONE','PENDING','ELIGIBLE')
  and q.invite_code is null
  and coalesce(a.state, '') not in ('HOLD','RESTRICTED')
  and (
    a.invite_code is null
    or freshness.newest_relevant_evidence_at > a.updated_at
  );

revoke all on public.operator_sybil_v2_early_assessment_candidates
  from public, anon, authenticated;
grant select on public.operator_sybil_v2_early_assessment_candidates
  to service_role;

comment on view public.operator_sybil_v2_early_assessment_candidates is
  'Pre-Claim Sybil v2 candidates with complete historical/funding scans. Re-opens only when invite-specific or cluster-related app, sink, funder, or checkpoint evidence is newer than the last assessment. PAID and Claim-ready rows are excluded.';

commit;
