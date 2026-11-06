-- VeInvite monitoring-only correction, 2026-11-06.
-- 2026-11-04 historical entry rows had activation_network filled from NULL to mainnet,
-- making pre-proof-enforcement (before 2026-08-23 09:05 UTC) referrals appear as
-- NEW critical data-integrity failures. Do not rewrite/refund/delete any invite.
--
-- Exclude only provably old, never-funded and non-terminally-rewarded records
-- from accepted_missing_entry_proof. Their historical proof gaps stay visible
-- in operator_release_health.legacy_proofless_accepted.
-- A pre-cutover row still triggers CRITICAL when it was activated after cutover,
-- is completed/under review, has an ELIGIBLE/PAID reward, or has any
-- queue/payout record. All other integrity metrics remain unchanged.
--
-- Keep output column order and existing grants; do not change RLS, payout,
-- Sybil, Claim, X bonus or any write-path financial authority.
CREATE OR REPLACE VIEW public.operator_data_quality AS
 WITH networks(network) AS (
         VALUES ('mainnet'::text), ('testnet'::text), ('testnet-staging'::text)
        ), base AS (
         SELECT n.network,
            count(i.invite_code) FILTER (WHERE i.invitee_wallet IS NOT NULL AND i.activation_network = n.network AND (i.eligibility_check_id IS NULL OR NOT (EXISTS ( SELECT 1
                   FROM eligibility_check_events e
                  WHERE e.id = i.eligibility_check_id AND e.invite_code = i.invite_code AND e.wallet_address = i.invitee_wallet AND e.network = i.activation_network AND e.outcome = 'ELIGIBLE'::text AND e.checked_block <= i.activation_block))) AND NOT (i.created_at < timestamptz '2026-08-23 09:05:00+00'
AND coalesce(i.activated_at, i.created_at) < timestamptz '2026-08-23 09:05:00+00'
AND i.status IN ('ACTIVATING', 'CANCELLED')
AND i.reward_status IN ('NONE', 'PENDING', 'FORFEITED')
AND NOT EXISTS (SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code = i.invite_code)
AND NOT EXISTS (SELECT 1 FROM public.reward_payouts rp WHERE rp.invite_code = i.invite_code))) AS accepted_missing_entry_proof,
            count(i.invite_code) FILTER (WHERE i.activation_network = n.network AND i.invitee_wallet IS NOT NULL AND i.eligibility_check_id IS NOT NULL AND (i.status = ANY (ARRAY['ACTIVATING'::text, 'UNDER_REVIEW'::text, 'COMPLETED'::text])) AND COALESCE(i.apps_completed, 0) >= 3 AND COALESCE(i.rewards_received, 0) >= 3 AND COALESCE(i.vot3_converted, false) AND COALESCE(i.vote_completed, false) AND i.apps_completed_block IS NOT NULL AND i.vot3_converted_block IS NOT NULL AND i.vote_completed_block IS NOT NULL AND (i.sybil_status = ANY (ARRAY['NOT_CHECKED'::text, 'REVIEW'::text]))) AS unresolved_sybil_after_vote,
            count(i.invite_code) FILTER (WHERE i.activation_network = n.network AND i.status = 'COMPLETED'::text AND i.impact_sync_complete_at IS NULL) AS completed_missing_impact_evidence,
            count(i.invite_code) FILTER (WHERE i.activation_network = n.network AND i.status = 'COMPLETED'::text AND (( SELECT count(DISTINCT ev.app_id) AS count
                   FROM invite_impact_events ev
                  WHERE ev.invite_code = i.invite_code AND ev.network = n.network AND ev.wallet_address = i.invitee_wallet AND ev.event_type = 'DAPP_REWARD'::text)) < 3) AS completed_missing_raw_reward_events,
            count(i.invite_code) FILTER (WHERE i.activation_network = n.network AND i.status = 'COMPLETED'::text AND NOT (EXISTS ( SELECT 1
                   FROM invite_impact_events ev
                  WHERE ev.invite_code = i.invite_code AND ev.network = n.network AND ev.wallet_address = i.invitee_wallet AND ev.event_type = 'ALLOCATION_VOTE'::text AND ev.block_number = i.vote_completed_block AND ev.block_timestamp = i.vote_completed_at AND ev.vote_round_id = i.vote_round_id))) AS completed_missing_raw_vote_event,
            count(i.invite_code) FILTER (WHERE i.activation_network = n.network AND i.reward_status = 'ELIGIBLE'::text AND (i.impact_sync_complete_at IS NULL OR (( SELECT count(DISTINCT ev.app_id) AS count
                   FROM invite_impact_events ev
                  WHERE ev.invite_code = i.invite_code AND ev.network = n.network AND ev.wallet_address = i.invitee_wallet AND ev.event_type = 'DAPP_REWARD'::text)) < 3 OR NOT (EXISTS ( SELECT 1
                   FROM invite_impact_events ev
                  WHERE ev.invite_code = i.invite_code AND ev.network = n.network AND ev.wallet_address = i.invitee_wallet AND ev.event_type = 'ALLOCATION_VOTE'::text AND ev.block_number = i.vote_completed_block AND ev.block_timestamp = i.vote_completed_at AND ev.vote_round_id = i.vote_round_id)))) AS eligible_missing_raw_evidence,
            count(i.invite_code) FILTER (WHERE i.activation_network = n.network AND i.invitee_wallet IS NOT NULL AND i.eligibility_check_id IS NOT NULL AND (i.status = ANY (ARRAY['ACTIVATING'::text, 'UNDER_REVIEW'::text])) AND i.impact_sync_complete_at IS NULL AND COALESCE(i.apps_completed, 0) >= 3 AND COALESCE(i.rewards_received, 0) >= 3 AND COALESCE(i.vot3_converted, false) AND COALESCE(i.vote_completed, false) AND i.apps_completed_block IS NOT NULL AND i.vot3_converted_block IS NOT NULL AND i.vote_completed_block IS NOT NULL AND COALESCE(i.impact_last_synced_at, i.activated_at, i.created_at) < (now() - '26:00:00'::interval)) AS stale_incomplete_reconciliation
           FROM networks n
             LEFT JOIN invitations i ON true
          GROUP BY n.network
        ), payout_mismatch AS (
         SELECT n.network,
            (( SELECT count(*) AS count
                   FROM reward_payouts rp
                     JOIN reward_rounds rr ON rr.id = rp.round_id
                     JOIN invitations i ON i.invite_code = rp.invite_code
                  WHERE rr.network = n.network AND rp.status = 'PAID'::text AND i.reward_status <> 'PAID'::text)) + (( SELECT count(*) AS count
                   FROM invitations i
                  WHERE i.activation_network = n.network AND i.reward_status = 'PAID'::text AND NOT (EXISTS ( SELECT 1
                           FROM reward_payouts rp
                             JOIN reward_rounds rr ON rr.id = rp.round_id
                          WHERE rp.invite_code = i.invite_code AND rp.status = 'PAID'::text AND rr.network = n.network)))) AS payout_state_mismatches
           FROM networks n
        )
 SELECT b.network,
    b.accepted_missing_entry_proof,
    b.unresolved_sybil_after_vote,
    b.completed_missing_impact_evidence,
    b.completed_missing_raw_reward_events,
    b.completed_missing_raw_vote_event,
    b.eligible_missing_raw_evidence,
    b.stale_incomplete_reconciliation,
    p.payout_state_mismatches,
    b.accepted_missing_entry_proof = 0 AND b.unresolved_sybil_after_vote = 0 AND b.completed_missing_impact_evidence = 0 AND b.completed_missing_raw_reward_events = 0 AND b.completed_missing_raw_vote_event = 0 AND b.eligible_missing_raw_evidence = 0 AND b.stale_incomplete_reconciliation = 0 AND p.payout_state_mismatches = 0 AS is_clean
   FROM base b
     JOIN payout_mismatch p USING (network)
  ORDER BY b.network;
