-- Scope unresolved post-vote Sybil integrity alerts to fully completed modern missions.
--
-- A participant may legitimately vote before completing all three qualifying dApp
-- reward missions. That ordering is supported by VeInvite and must not create a
-- DATA_INTEGRITY_FAULT while the referral is still in progress.
--
-- Monitoring only. This migration does not mutate invitation, reward, payout,
-- Sybil assessment, or legacy invitation state.

begin;

create or replace view public.operator_data_quality as
with networks(network) as (
  values
    ('mainnet'::text),
    ('testnet'::text),
    ('testnet-staging'::text)
),
base as (
  select
    n.network,
    count(i.invite_code) filter (
      where i.invitee_wallet is not null
        and i.activation_network = n.network
        and (
          i.eligibility_check_id is null
          or not exists (
            select 1
            from public.eligibility_check_events e
            where e.id = i.eligibility_check_id
              and e.invite_code = i.invite_code
              and e.wallet_address = i.invitee_wallet
              and e.network = i.activation_network
              and e.outcome = 'ELIGIBLE'
              and e.checked_block <= i.activation_block
          )
        )
    ) as accepted_missing_entry_proof,
    count(i.invite_code) filter (
      where i.activation_network = n.network
        and i.invitee_wallet is not null
        and i.eligibility_check_id is not null
        and i.status in ('ACTIVATING', 'UNDER_REVIEW', 'COMPLETED')
        and coalesce(i.apps_completed, 0) >= 3
        and coalesce(i.rewards_received, 0) >= 3
        and coalesce(i.vot3_converted, false)
        and coalesce(i.vote_completed, false)
        and i.apps_completed_block is not null
        and i.vot3_converted_block is not null
        and i.vote_completed_block is not null
        and i.sybil_status in ('NOT_CHECKED', 'REVIEW')
    ) as unresolved_sybil_after_vote,
    count(i.invite_code) filter (
      where i.activation_network = n.network
        and i.status = 'COMPLETED'
        and i.impact_sync_complete_at is null
    ) as completed_missing_impact_evidence,
    count(i.invite_code) filter (
      where i.activation_network = n.network
        and i.status = 'COMPLETED'
        and (
          select count(distinct ev.app_id)
          from public.invite_impact_events ev
          where ev.invite_code = i.invite_code
            and ev.network = n.network
            and ev.wallet_address = i.invitee_wallet
            and ev.event_type = 'DAPP_REWARD'
        ) < 3
    ) as completed_missing_raw_reward_events,
    count(i.invite_code) filter (
      where i.activation_network = n.network
        and i.status = 'COMPLETED'
        and not exists (
          select 1
          from public.invite_impact_events ev
          where ev.invite_code = i.invite_code
            and ev.network = n.network
            and ev.wallet_address = i.invitee_wallet
            and ev.event_type = 'ALLOCATION_VOTE'
            and ev.block_number = i.vote_completed_block
            and ev.block_timestamp = i.vote_completed_at
            and ev.vote_round_id = i.vote_round_id
        )
    ) as completed_missing_raw_vote_event,
    count(i.invite_code) filter (
      where i.activation_network = n.network
        and i.reward_status = 'ELIGIBLE'
        and (
          i.impact_sync_complete_at is null
          or (
            select count(distinct ev.app_id)
            from public.invite_impact_events ev
            where ev.invite_code = i.invite_code
              and ev.network = n.network
              and ev.wallet_address = i.invitee_wallet
              and ev.event_type = 'DAPP_REWARD'
          ) < 3
          or not exists (
            select 1
            from public.invite_impact_events ev
            where ev.invite_code = i.invite_code
              and ev.network = n.network
              and ev.wallet_address = i.invitee_wallet
              and ev.event_type = 'ALLOCATION_VOTE'
              and ev.block_number = i.vote_completed_block
              and ev.block_timestamp = i.vote_completed_at
              and ev.vote_round_id = i.vote_round_id
          )
        )
    ) as eligible_missing_raw_evidence,
    count(i.invite_code) filter (
      where i.activation_network = n.network
        and i.invitee_wallet is not null
        and i.eligibility_check_id is not null
        and i.status in ('ACTIVATING', 'UNDER_REVIEW')
        and i.impact_sync_complete_at is null
        and coalesce(i.apps_completed, 0) >= 3
        and coalesce(i.rewards_received, 0) >= 3
        and coalesce(i.vot3_converted, false)
        and coalesce(i.vote_completed, false)
        and i.apps_completed_block is not null
        and i.vot3_converted_block is not null
        and i.vote_completed_block is not null
        and coalesce(
          i.impact_last_synced_at,
          i.activated_at,
          i.created_at
        ) < now() - interval '26 hours'
    ) as stale_incomplete_reconciliation
  from networks n
  left join public.invitations i on true
  group by n.network
),
payout_mismatch as (
  select
    n.network,
    (
      select count(*)
      from public.reward_payouts rp
      join public.reward_rounds rr
        on rr.id = rp.round_id
      join public.invitations i
        on i.invite_code = rp.invite_code
      where rr.network = n.network
        and rp.status = 'PAID'
        and i.reward_status <> 'PAID'
    ) + (
      select count(*)
      from public.invitations i
      where i.activation_network = n.network
        and i.reward_status = 'PAID'
        and not exists (
          select 1
          from public.reward_payouts rp
          join public.reward_rounds rr
            on rr.id = rp.round_id
          where rp.invite_code = i.invite_code
            and rp.status = 'PAID'
            and rr.network = n.network
        )
    ) as payout_state_mismatches
  from networks n
)
select
  b.network,
  b.accepted_missing_entry_proof,
  b.unresolved_sybil_after_vote,
  b.completed_missing_impact_evidence,
  b.completed_missing_raw_reward_events,
  b.completed_missing_raw_vote_event,
  b.eligible_missing_raw_evidence,
  b.stale_incomplete_reconciliation,
  p.payout_state_mismatches,
  b.accepted_missing_entry_proof = 0
    and b.unresolved_sybil_after_vote = 0
    and b.completed_missing_impact_evidence = 0
    and b.completed_missing_raw_reward_events = 0
    and b.completed_missing_raw_vote_event = 0
    and b.eligible_missing_raw_evidence = 0
    and b.stale_incomplete_reconciliation = 0
    and p.payout_state_mismatches = 0 as is_clean
from base b
join payout_mismatch p using (network)
order by b.network;

revoke all on table public.operator_data_quality
  from public, anon, authenticated, service_role;
grant select on table public.operator_data_quality
  to service_role;

comment on view public.operator_data_quality is
  'Private operator data-quality projection. Unresolved post-vote Sybil integrity applies only after all modern mission requirements and immutable milestone blocks are complete; vote-before-third-app progress is not an incident.';

commit;
