-- Operator READ-ONLY audit. Safe to run against VeInvite Production.
-- No DML/DDL, token movements, eligibility approvals, or release permissions.
-- A destination release plan is historical budget evidence, not an escrow
-- balance, and neither this query nor its output authorizes B3TR transfer.
WITH latest_destination AS (
  SELECT p.*
  FROM public.reward_boost_reserve_destination_plans p
  WHERE p.network='mainnet'
    AND p.app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
  ORDER BY p.created_at DESC,p.id DESC
  LIMIT 1
),
already_released AS (
  SELECT COALESCE(SUM(l.amount_wei),0) AS released_wei,COUNT(*) AS release_events
  FROM public.reward_boost_reserve_ledger l
  JOIN latest_destination d
    ON d.network=l.network AND d.app_id=l.app_id
   AND d.destination_reward_cohort_round_id=l.destination_reward_cohort_round_id
   AND d.destination_allocation_receipt_id=l.destination_allocation_receipt_id
  WHERE l.entry_kind='BOOST_RELEASE'
),
pending_risk AS (
  SELECT
    COUNT(*) FILTER (WHERE i.sybil_status='NOT_CHECKED' AND i.reward_paid_at IS NULL)
      AS unreviewed_unpaid_invites,
    COUNT(*) FILTER (WHERE i.reward_eligible_at IS NOT NULL AND i.reward_paid_at IS NULL)
      AS eligible_unpaid_invites,
    COUNT(*) FILTER (WHERE i.sybil_status='NOT_CHECKED'
                      AND i.reward_paid_at IS NULL
                      AND i.apps_completed>=3
                      AND i.vote_completed IS NOT TRUE)
      AS three_apps_vote_incomplete_invites
  FROM public.invitations i
  WHERE i.reward_cohort_round_id IS NOT NULL
),
latest_pool AS (
  SELECT f.observed_pool_balance_wei,f.reserved_existing_wei,f.created_at
  FROM public.reward_forecast_snapshots f
  JOIN latest_destination d ON d.network=f.network AND d.app_id=f.app_id
  ORDER BY f.created_at DESC,f.id DESC
  LIMIT 1
),
new_admission AS (
  SELECT COUNT(*) AS active_held_count
  FROM reward_admission_bridge.holds
  WHERE network='mainnet' AND status='HELD'
)
SELECT
 d.destination_reward_cohort_round_id AS target_cohort,
 d.created_at AS protection_snapshot_at,
 (d.source_retained_protection_wei/1e18)::numeric(24,5) AS historical_retained_b3tr,
 (d.recent_cohort_protected_wei/1e18)::numeric(24,5) AS recent_protected_b3tr,
 ((d.source_retained_protection_wei+d.recent_cohort_protected_wei)/1e18)::numeric(24,5)
   AS combined_protection_snapshot_b3tr,
 (d.max_boost_release_wei/1e18)::numeric(24,5) AS snapshot_release_ceiling_b3tr,
 (r.released_wei/1e18)::numeric(24,5) AS already_released_to_cohort_b3tr,
 (GREATEST(d.max_boost_release_wei-r.released_wei,0)/1e18)::numeric(24,5)
   AS unreleased_snapshot_headroom_b3tr,
 r.release_events,
 p.unreviewed_unpaid_invites,
 p.eligible_unpaid_invites,
 p.three_apps_vote_incomplete_invites,
 h.active_held_count,
 (f.observed_pool_balance_wei/1e18)::numeric(24,5) AS last_observed_pool_b3tr,
 f.created_at AS last_pool_observation_at,
 CASE
   WHEN r.released_wei>d.max_boost_release_wei THEN 'OVER_RELEASED_REQUIRES_INVESTIGATION'
   WHEN r.released_wei=d.max_boost_release_wei THEN 'NO_UNRELEASED_CAPACITY_IN_SNAPSHOT'
   WHEN p.unreviewed_unpaid_invites>0 OR p.eligible_unpaid_invites>0
     THEN 'UNRESOLVED_REWARD_RIGHTS_REVIEW_REQUIRED'
   WHEN h.active_held_count>0 THEN 'ADMISSION_HELD_RIGHTS_REVIEW_REQUIRED'
   WHEN f.created_at IS NULL OR f.created_at<now()-interval '30 minutes'
     THEN 'POOL_EVIDENCE_STALE'
   ELSE 'ONCHAIN_AND_ALLOCATION_RECONCILIATION_REQUIRED'
 END AS non_authoritative_readiness,
 FALSE AS authorizes_transfer_or_release
FROM latest_destination d
CROSS JOIN already_released r
CROSS JOIN pending_risk p
CROSS JOIN new_admission h
LEFT JOIN latest_pool f ON TRUE;
