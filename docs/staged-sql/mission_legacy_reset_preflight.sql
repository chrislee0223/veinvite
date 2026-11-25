-- Operator-only read-only preflight. This is NOT an eligibility or payout authority.
-- Historical report snapshots can be incomplete. A missing match is not proof of invalidity.
WITH candidates AS (
 SELECT i.id,i.invite_code,i.activated_at,i.activation_network,i.activation_block,
 i.reward_cohort_round_id,i.eligibility_check_id,i.slot_released_at,i.vote_completed,
 i.sybil_status,i.ineligible_at,i.impact_sync_complete_at,
 (SELECT count(*) FROM public.reward_payouts p WHERE p.invite_code=i.invite_code) payout_count,
 (SELECT count(*) FROM public.reward_receipts p WHERE p.invite_code=i.invite_code) receipt_count,
 (SELECT count(*) FROM reward_admission_bridge.holds h WHERE h.invite_code=i.invite_code) hold_count,
 (SELECT count(*) FROM public.reward_reservation_legacy_exclusions e WHERE e.invite_code=i.invite_code) exclusion_count,
 (SELECT count(*) FROM public.sybil_v2_referral_invalidations s WHERE s.invite_code=i.invite_code) invalidation_count,
 (SELECT count(*) FROM reward_admission_bridge.mission_two_round_resolution_v1 r WHERE r.invitation_id=i.id) resolution_count
 FROM public.invitations i WHERE i.status='ACTIVATING' AND i.reward_status='PENDING'
 AND NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1 a WHERE a.invitation_id=i.id AND a.state='ACTIVE')
), round_matches AS (
 SELECT c.*,r.round_count,r.actual_round
 FROM candidates c LEFT JOIN LATERAL (
 SELECT count(DISTINCT s.round_id) round_count,min(s.round_id) actual_round
 FROM public.operator_latest_round_growth_report_snapshots s
 WHERE s.network=c.activation_network AND c.activation_block BETWEEN s.round_start_block AND s.round_end_block
 ) r ON true
), classified AS (
 SELECT *,CASE
 WHEN payout_count>0 OR receipt_count>0 OR hold_count>0 OR exclusion_count>0 OR invalidation_count>0
 OR slot_released_at IS NOT NULL OR coalesce(sybil_status,'') IN ('REVIEW','BLOCKED')
 OR ineligible_at IS NOT NULL OR (vote_completed AND impact_sync_complete_at IS NOT NULL)
 THEN 'PROTECTED_HISTORY_REVIEW'
 WHEN activation_network IS NULL OR activation_block IS NULL OR eligibility_check_id IS NULL OR reward_cohort_round_id IS NULL
 THEN 'ENTRY_PROOF_REVIEW'
 WHEN round_count>1 THEN 'ROUND_EVIDENCE_CONFLICT'
 WHEN round_count=1 AND actual_round<>reward_cohort_round_id THEN 'MISSION_FUNDING_ROUND_MISMATCH'
 ELSE 'CHECK_CURRENT_WINDOW_OR_SWEEP' END AS diagnosis
 FROM round_matches
)
SELECT invite_code,activated_at,reward_cohort_round_id,actual_round,diagnosis,resolution_count
FROM classified ORDER BY activated_at DESC NULLS LAST;
