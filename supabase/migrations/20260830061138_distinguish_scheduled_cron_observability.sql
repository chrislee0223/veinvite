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
