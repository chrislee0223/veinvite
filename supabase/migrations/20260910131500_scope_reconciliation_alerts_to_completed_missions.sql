-- Reconciliation freshness is an operational signal, not a mission timer.
-- A participant who is still completing missions (for example, has not cast
-- the Allocation Vote yet) must not become an incident simply because more
-- than one daily cron window has elapsed. Only fully completed modern missions
-- with immutable milestone blocks are eligible for stale-reconciliation alerts.
--
-- This migration changes monitoring projections only. It does not rewrite
-- invitation evidence, reward state, legacy rows, or payout data.

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
        and i.vote_completed = true
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
  'Private operator data-quality projection. Stale reconciliation applies only to fully completed modern missions with immutable milestone blocks; in-progress participants are not incidents.';

create or replace view public.operator_release_health as
with cutoff as (
  select '2026-08-23 09:05:00+00'::timestamptz as entry_proof_enforced_at
),
legacy_and_current as (
  select
    count(*) filter (
      where status = any(array['ACTIVATING'::text,'UNDER_REVIEW'::text,'COMPLETED'::text])
        and invitee_wallet is not null
        and coalesce(activated_at, created_at) < (select entry_proof_enforced_at from cutoff)
        and (activation_network is null or eligibility_check_id is null)
    ) as legacy_proofless_accepted,
    count(*) filter (
      where status = any(array['ACTIVATING'::text,'UNDER_REVIEW'::text,'COMPLETED'::text])
        and invitee_wallet is not null
        and coalesce(activated_at, created_at) >= (select entry_proof_enforced_at from cutoff)
        and activation_network is null
    ) as current_accepted_missing_network,
    count(*) filter (
      where status = any(array['ACTIVATING'::text,'UNDER_REVIEW'::text,'COMPLETED'::text])
        and invitee_wallet is not null
        and coalesce(activated_at, created_at) >= (select entry_proof_enforced_at from cutoff)
        and eligibility_check_id is null
    ) as current_accepted_missing_entry_check,
    count(*) filter (
      where reward_status = 'PAID'::text
        and reward_paid_at is null
    ) as paid_invites_missing_paid_at
  from public.invitations
),
mainnet_quality as (
  select *
  from public.operator_data_quality
  where network = 'mainnet'::text
),
reward_quality as (
  select *
  from public.operator_reward_data_quality
  where network = 'mainnet'::text
),
daily_reconciliation as (
  select count(*) as incomplete_over_30h
  from public.invitations
  where status = any(array['ACTIVATING'::text,'UNDER_REVIEW'::text])
    and invitee_wallet is not null
    and eligibility_check_id is not null
    and activation_network = 'mainnet'::text
    and impact_sync_complete_at is null
    and coalesce(apps_completed, 0) >= 3
    and coalesce(rewards_received, 0) >= 3
    and coalesce(vot3_converted, false)
    and coalesce(vote_completed, false)
    and apps_completed_block is not null
    and vot3_converted_block is not null
    and vote_completed_block is not null
    and coalesce(impact_last_synced_at, activated_at, created_at) < now() - interval '30 hours'
),
latest_monitor as (
  select captured_at, severity, alert_count, trigger_source
  from public.operator_monitor_snapshots
  where network = 'mainnet'::text
  order by captured_at desc
  limit 1
),
latest_vercel_cron as (
  select max(captured_at) as captured_at
  from public.operator_monitor_snapshots
  where network = 'mainnet'::text
    and trigger_source = 'VERCEL_CRON'::text
)
select
  now() as checked_at,
  (select entry_proof_enforced_at from cutoff) as entry_proof_enforced_at,
  lc.legacy_proofless_accepted,
  lc.current_accepted_missing_network,
  lc.current_accepted_missing_entry_check,
  lc.paid_invites_missing_paid_at,
  coalesce(mq.accepted_missing_entry_proof, 0::bigint) as accepted_missing_entry_proof,
  coalesce(mq.unresolved_sybil_after_vote, 0::bigint) as unresolved_sybil_after_vote,
  coalesce(mq.completed_missing_impact_evidence, 0::bigint) as completed_missing_impact_evidence,
  coalesce(mq.completed_missing_raw_reward_events, 0::bigint) as completed_missing_raw_reward_events,
  coalesce(mq.completed_missing_raw_vote_event, 0::bigint) as completed_missing_raw_vote_event,
  coalesce(mq.eligible_missing_raw_evidence, 0::bigint) as eligible_missing_raw_evidence,
  coalesce(mq.payout_state_mismatches, 0::bigint) as payout_state_mismatches,
  coalesce(mq.stale_incomplete_reconciliation, 0::bigint) as legacy_one_hour_reconciliation_warning,
  dr.incomplete_over_30h as reconciliation_incomplete_over_30h,
  coalesce(rq.is_clean, true) as reward_accounting_clean,
  lm.captured_at as latest_monitor_snapshot_at,
  case
    when lm.captured_at is null then null::numeric
    else round(extract(epoch from now() - lm.captured_at) / 3600.0, 2)
  end as monitor_snapshot_age_hours,
  lm.severity as latest_monitor_severity,
  lm.alert_count as latest_monitor_alert_count,
  lm.captured_at is not null and lm.captured_at >= now() - interval '36 hours' as cron_observability_recent,
  lc.current_accepted_missing_network = 0
    and lc.current_accepted_missing_entry_check = 0
    and lc.paid_invites_missing_paid_at = 0
    and coalesce(mq.accepted_missing_entry_proof, 0::bigint) = 0
    and coalesce(mq.unresolved_sybil_after_vote, 0::bigint) = 0
    and coalesce(mq.completed_missing_impact_evidence, 0::bigint) = 0
    and coalesce(mq.completed_missing_raw_reward_events, 0::bigint) = 0
    and coalesce(mq.completed_missing_raw_vote_event, 0::bigint) = 0
    and coalesce(mq.eligible_missing_raw_evidence, 0::bigint) = 0
    and coalesce(mq.payout_state_mismatches, 0::bigint) = 0
    and coalesce(rq.is_clean, true) as current_integrity_clean,
  dr.incomplete_over_30h = 0 as reconciliation_within_daily_window,
  lm.trigger_source as latest_monitor_trigger_source,
  vc.captured_at as last_vercel_cron_at,
  vc.captured_at is not null and vc.captured_at >= now() - interval '36 hours' as scheduled_cron_observed_recently
from legacy_and_current lc
cross join daily_reconciliation dr
left join mainnet_quality mq on true
left join reward_quality rq on true
left join latest_monitor lm on true
left join latest_vercel_cron vc on true;

revoke all on public.operator_release_health from public, anon, authenticated;
grant select on public.operator_release_health to service_role;

comment on view public.operator_release_health is
  'Service-role release health summary. Reconciliation-over-30h now means a fully completed modern mission whose evidence still has not synchronized; ordinary in-progress participants and preserved legacy rows are excluded.';
