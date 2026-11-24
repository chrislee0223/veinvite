\set ON_ERROR_STOP on
-- REAL PRODUCTION FUNCTION SOURCE + synthetic data, isolated CI PostgreSQL.
-- No actual users, financial balances, keys or transfers are copied.
-- Table columns are captured from the live catalog, but this is not a full
-- physical database clone; unrelated constraints/audit triggers are omitted.

CREATE TABLE IF NOT EXISTS public.invitations ();
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "inviter_wallet" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "invitee_wallet" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "apps_completed" integer;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "rewards_received" integer;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "vote_completed" boolean;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "reward_status" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "reward_paid_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "operator_note" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "activated_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "activation_block" bigint;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "apps_completed_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "apps_completed_block" bigint;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "vote_completed_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "vote_completed_block" bigint;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "vote_round_id" bigint;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "reward_eligible_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "sybil_status" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "sybil_risk_level" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "sybil_risk_score" integer;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "sybil_reason" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "sybil_checked_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "sybil_source" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "activation_network" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "eligibility_check_id" bigint;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "impact_last_synced_block" bigint;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "impact_last_synced_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "impact_sync_complete_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "vot3_converted" boolean;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "vot3_converted_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "vot3_converted_block" bigint;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "vot3_conversion_tx_id" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "vot3_conversion_amount_wei" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "ineligibility_check_id" bigint;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "ineligible_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "invite_slot" smallint;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "referral_link_id" uuid;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "slot_released_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "reward_cohort_round_id" bigint;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "reward_funding_allocation_receipt_id" bigint;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "reward_cohort_binding_source" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "identity_link_status" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "identity_link_risk_score" integer;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "identity_link_reason" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "identity_link_checked_at" timestamp with time zone;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "identity_link_policy_version" text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "identity_link_evidence" jsonb;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS "inviter_released_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.referral_links ();
ALTER TABLE public.referral_links ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public.referral_links ADD COLUMN IF NOT EXISTS "inviter_wallet" text;
ALTER TABLE public.referral_links ADD COLUMN IF NOT EXISTS "referral_key" text;
ALTER TABLE public.referral_links ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public.referral_links ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;
ALTER TABLE public.referral_links ADD COLUMN IF NOT EXISTS "rotated_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.reward_boost_reserve_ledger ();
ALTER TABLE public.reward_boost_reserve_ledger ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.reward_boost_reserve_ledger ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.reward_boost_reserve_ledger ADD COLUMN IF NOT EXISTS "app_id" text;
ALTER TABLE public.reward_boost_reserve_ledger ADD COLUMN IF NOT EXISTS "entry_kind" text;
ALTER TABLE public.reward_boost_reserve_ledger ADD COLUMN IF NOT EXISTS "source_reward_cohort_round_id" bigint;
ALTER TABLE public.reward_boost_reserve_ledger ADD COLUMN IF NOT EXISTS "source_allocation_receipt_id" bigint;
ALTER TABLE public.reward_boost_reserve_ledger ADD COLUMN IF NOT EXISTS "destination_reward_cohort_round_id" bigint;
ALTER TABLE public.reward_boost_reserve_ledger ADD COLUMN IF NOT EXISTS "destination_allocation_receipt_id" bigint;
ALTER TABLE public.reward_boost_reserve_ledger ADD COLUMN IF NOT EXISTS "amount_wei" numeric(78,0);
ALTER TABLE public.reward_boost_reserve_ledger ADD COLUMN IF NOT EXISTS "policy_version" text;
ALTER TABLE public.reward_boost_reserve_ledger ADD COLUMN IF NOT EXISTS "reference_key" text;
ALTER TABLE public.reward_boost_reserve_ledger ADD COLUMN IF NOT EXISTS "details" jsonb;
ALTER TABLE public.reward_boost_reserve_ledger ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.reward_budget_epochs ();
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "app_id" text;
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "allocation_receipt_id" bigint;
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "vebetter_round_id" bigint;
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "allocation_rewards_wei" numeric(78,0);
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "opening_pool_balance_wei" numeric(78,0);
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "opening_reserved_wei" numeric(78,0);
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "expected_completions" integer;
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "stress_completions" integer;
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "reward_per_invite_wei" numeric(78,0);
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "algorithm_version" text;
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "pipeline_snapshot" jsonb;
ALTER TABLE public.reward_budget_epochs ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.reward_cohort_funding_adjustments ();
ALTER TABLE public.reward_cohort_funding_adjustments ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.reward_cohort_funding_adjustments ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.reward_cohort_funding_adjustments ADD COLUMN IF NOT EXISTS "app_id" text;
ALTER TABLE public.reward_cohort_funding_adjustments ADD COLUMN IF NOT EXISTS "reward_cohort_round_id" bigint;
ALTER TABLE public.reward_cohort_funding_adjustments ADD COLUMN IF NOT EXISTS "allocation_receipt_id" bigint;
ALTER TABLE public.reward_cohort_funding_adjustments ADD COLUMN IF NOT EXISTS "adjustment_type" text;
ALTER TABLE public.reward_cohort_funding_adjustments ADD COLUMN IF NOT EXISTS "amount_wei" numeric(78,0);
ALTER TABLE public.reward_cohort_funding_adjustments ADD COLUMN IF NOT EXISTS "reference_key" text;
ALTER TABLE public.reward_cohort_funding_adjustments ADD COLUMN IF NOT EXISTS "details" jsonb;
ALTER TABLE public.reward_cohort_funding_adjustments ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.reward_payout_transaction_settlements ();
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "manifest_id" bigint;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "round_id" bigint;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "manifest_hash" text;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "tx_id" text;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "tx_origin" text;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "block_id" text;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "block_number" bigint;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "block_timestamp" bigint;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "finalized_head_id" text;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "finalized_head_number" bigint;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "clause_count" integer;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;
ALTER TABLE public.reward_payout_transaction_settlements ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.reward_payouts ();
ALTER TABLE public.reward_payouts ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.reward_payouts ADD COLUMN IF NOT EXISTS "round_id" bigint;
ALTER TABLE public.reward_payouts ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE public.reward_payouts ADD COLUMN IF NOT EXISTS "recipient_wallet" text;
ALTER TABLE public.reward_payouts ADD COLUMN IF NOT EXISTS "amount_wei" numeric(78,0);
ALTER TABLE public.reward_payouts ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public.reward_payouts ADD COLUMN IF NOT EXISTS "tx_id" text;
ALTER TABLE public.reward_payouts ADD COLUMN IF NOT EXISTS "attempt_count" integer;
ALTER TABLE public.reward_payouts ADD COLUMN IF NOT EXISTS "error_message" text;
ALTER TABLE public.reward_payouts ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;
ALTER TABLE public.reward_payouts ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;
ALTER TABLE public.reward_payouts ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;
ALTER TABLE public.reward_payouts ADD COLUMN IF NOT EXISTS "public_proof_id" uuid;

CREATE TABLE IF NOT EXISTS public.reward_queue_entries ();
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "recipient_wallet" text;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "eligibility_check_id" bigint;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "entry_class" text;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "eligible_at" timestamp with time zone;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "assigned_round_id" bigint;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "queued_at" timestamp with time zone;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "assigned_at" timestamp with time zone;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "cancel_reason" text;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "claim_requested_at" timestamp with time zone;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "claim_requested_by_wallet" text;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "reserved_amount_wei" numeric(78,0);
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "reserved_at" timestamp with time zone;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "reservation_algorithm_version" text;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "reservation_quote_snapshot_id" bigint;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "reservation_completion_block" bigint;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "reservation_completion_tx_index" integer;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "reservation_completion_clause_index" integer;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "reservation_basis" jsonb;
ALTER TABLE public.reward_queue_entries ADD COLUMN IF NOT EXISTS "sybil_clearance_id" uuid;

CREATE TABLE IF NOT EXISTS public.reward_receipts ();
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "receipt_version" text;
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "payout_id" bigint;
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "round_id" bigint;
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "settlement_id" bigint;
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "vebetter_round_id" bigint;
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "recipient_wallet" text;
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "amount_wei" numeric(78,0);
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "tx_id" text;
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "seen_at" timestamp with time zone;
ALTER TABLE public.reward_receipts ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.reward_recovery_allocations ();
ALTER TABLE public.reward_recovery_allocations ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.reward_recovery_allocations ADD COLUMN IF NOT EXISTS "settlement_id" uuid;
ALTER TABLE public.reward_recovery_allocations ADD COLUMN IF NOT EXISTS "obligation_id" uuid;
ALTER TABLE public.reward_recovery_allocations ADD COLUMN IF NOT EXISTS "amount_wei" numeric(78,0);
ALTER TABLE public.reward_recovery_allocations ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.reward_recovery_obligations ();
ALTER TABLE public.reward_recovery_obligations ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public.reward_recovery_obligations ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.reward_recovery_obligations ADD COLUMN IF NOT EXISTS "recipient_wallet" text;
ALTER TABLE public.reward_recovery_obligations ADD COLUMN IF NOT EXISTS "source_invalidation_id" uuid;
ALTER TABLE public.reward_recovery_obligations ADD COLUMN IF NOT EXISTS "source_receipt_id" bigint;
ALTER TABLE public.reward_recovery_obligations ADD COLUMN IF NOT EXISTS "source_invite_code" text;
ALTER TABLE public.reward_recovery_obligations ADD COLUMN IF NOT EXISTS "amount_wei" numeric(78,0);
ALTER TABLE public.reward_recovery_obligations ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public.reward_recovery_obligations ADD COLUMN IF NOT EXISTS "status_reason" text;
ALTER TABLE public.reward_recovery_obligations ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;
ALTER TABLE public.reward_recovery_obligations ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;
ALTER TABLE public.reward_recovery_obligations ADD COLUMN IF NOT EXISTS "source_settlement_id" uuid;
ALTER TABLE public.reward_recovery_obligations ADD COLUMN IF NOT EXISTS "source_restriction_id" uuid;

CREATE TABLE IF NOT EXISTS public.reward_recovery_settlements ();
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "recipient_wallet" text;
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "settlement_kind" text;
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "state" text;
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "gross_amount_wei" numeric(78,0);
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "offset_amount_wei" numeric(78,0);
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "net_amount_wei" numeric(78,0);
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "sybil_clearance_id" uuid;
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "completion_block" bigint;
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "completion_tx_index" integer;
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "completion_clause_index" integer;
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "completion_tx_id" text;
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "settled_at" timestamp with time zone;
ALTER TABLE public.reward_recovery_settlements ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.reward_reservation_legacy_exclusions ();
ALTER TABLE public.reward_reservation_legacy_exclusions ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE public.reward_reservation_legacy_exclusions ADD COLUMN IF NOT EXISTS "reason" text;
ALTER TABLE public.reward_reservation_legacy_exclusions ADD COLUMN IF NOT EXISTS "excluded_at" timestamp with time zone;
ALTER TABLE public.reward_reservation_legacy_exclusions ADD COLUMN IF NOT EXISTS "snapshot" jsonb;

CREATE TABLE IF NOT EXISTS public.reward_rounds ();
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "app_id" text;
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "observed_pool_balance_wei" numeric(78,0);
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "reserved_before_round_wei" numeric(78,0);
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "distributable_wei" numeric(78,0);
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "eligible_count" integer;
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "per_reward_wei" numeric(78,0);
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "remainder_wei" numeric(78,0);
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "vebetter_round_id" bigint;
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "allocation_receipt_id" bigint;
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "allocation_rewards_wei" numeric(78,0);
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "opening_carryover_wei" numeric(78,0);
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "reward_budget_epoch_id" bigint;
ALTER TABLE public.reward_rounds ADD COLUMN IF NOT EXISTS "broadcast_confirmed_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.reward_runtime_config ();
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "id" smallint;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "mainnet_funded_rewards_enabled" boolean;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "note" text;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "emergency_rewards_paused" boolean;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "emergency_pause_reason" text;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "emergency_pause_changed_at" timestamp with time zone;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "emergency_pause_changed_by" text;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "emergency_pause_network" text;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "sybil_v2_enforcement_enabled" boolean;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "sybil_v2_enforcement_changed_at" timestamp with time zone;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "sybil_v2_enforcement_reason" text;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "sybil_v2_automatic_observation_started_at" timestamp with time zone;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_recovery_enabled" boolean;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_boost_reserve_enabled" boolean;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_boost_reserve_shadow_enabled" boolean;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_boost_reserve_long_incomplete_rounds" integer;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_boost_reserve_promotion_reserve_bps" integer;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_x_promotion_enabled" boolean;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_x_promotion_shadow_enabled" boolean;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_x_promotion_policy_version" text;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_x_promotion_shadow_started_at" timestamp with time zone;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_x_promotion_live_started_at" timestamp with time zone;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_x_promotion_payout_enabled" boolean;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_x_promotion_external_verification_ready" boolean;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_x_promotion_external_verification_started_at" timestamp with time zone;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_boost_reserve_adaptive_v2_enabled" boolean;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_boost_current_topup_target_round_id" bigint;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_x_promotion_early_canonical_enabled" boolean;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_boost_early_empty_rollover_enabled" boolean;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_x_promotion_v3_cutover_at" timestamp with time zone;
ALTER TABLE public.reward_runtime_config ADD COLUMN IF NOT EXISTS "reward_x_promotion_v3_sunset_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.reward_x_promotion_external_runtime_checks ();
ALTER TABLE public.reward_x_promotion_external_runtime_checks ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.reward_x_promotion_external_runtime_checks ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.reward_x_promotion_external_runtime_checks ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public.reward_x_promotion_external_runtime_checks ADD COLUMN IF NOT EXISTS "probe_post_id" text;
ALTER TABLE public.reward_x_promotion_external_runtime_checks ADD COLUMN IF NOT EXISTS "checked_at" timestamp with time zone;
ALTER TABLE public.reward_x_promotion_external_runtime_checks ADD COLUMN IF NOT EXISTS "details" jsonb;

CREATE TABLE IF NOT EXISTS public.reward_x_promotion_obligations ();
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "split_id" bigint;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "recipient_wallet" text;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "promotion_amount_wei" numeric(78,0);
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "source_reward_cohort_round_id" bigint;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "source_allocation_receipt_id" bigint;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "policy_version" text;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "financial_state" text;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "held_at" timestamp with time zone;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "released_at" timestamp with time zone;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "release_reason" text;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;
ALTER TABLE public.reward_x_promotion_obligations ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.reward_x_promotion_split_exemptions ();
ALTER TABLE public.reward_x_promotion_split_exemptions ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.reward_x_promotion_split_exemptions ADD COLUMN IF NOT EXISTS "queue_entry_id" bigint;
ALTER TABLE public.reward_x_promotion_split_exemptions ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE public.reward_x_promotion_split_exemptions ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.reward_x_promotion_split_exemptions ADD COLUMN IF NOT EXISTS "recipient_wallet" text;
ALTER TABLE public.reward_x_promotion_split_exemptions ADD COLUMN IF NOT EXISTS "reservation_amount_wei" numeric(78,0);
ALTER TABLE public.reward_x_promotion_split_exemptions ADD COLUMN IF NOT EXISTS "exemption_reason" text;
ALTER TABLE public.reward_x_promotion_split_exemptions ADD COLUMN IF NOT EXISTS "policy_version" text;
ALTER TABLE public.reward_x_promotion_split_exemptions ADD COLUMN IF NOT EXISTS "details" jsonb;
ALTER TABLE public.reward_x_promotion_split_exemptions ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.reward_x_promotion_splits ();
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "queue_entry_id" bigint;
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "recipient_wallet" text;
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "reservation_amount_wei" numeric(78,0);
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "base_amount_wei" numeric(78,0);
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "promotion_amount_wei" numeric(78,0);
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "source_reward_cohort_round_id" bigint;
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "source_allocation_receipt_id" bigint;
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "mode" text;
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "policy_version" text;
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "promotion_rate_bps" integer;
ALTER TABLE public.reward_x_promotion_splits ADD COLUMN IF NOT EXISTS "promotion_cap_wei" numeric(78,0);

CREATE TABLE IF NOT EXISTS public.sybil_v2_referral_assessments ();
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "state" text;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "risk_score" integer;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "policy_version" text;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "analyzer_version" text;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "revision" bigint;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "evidence_cutoff_block" bigint;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "required_checks" jsonb;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "completed_checks" jsonb;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "reason_codes" jsonb;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "evidence_summary" jsonb;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "assessed_at" timestamp with time zone;
ALTER TABLE public.sybil_v2_referral_assessments ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.sybil_v2_referral_invalidations ();
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "invitation_id" uuid;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "inviter_wallet" text;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "invitee_wallet" text;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "case_key" text;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "reason_codes" jsonb;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "evidence_summary" jsonb;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "operator_wallet" text;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "operator_reason" text;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "reinstated_at" timestamp with time zone;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "reinstated_by" text;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "reinstatement_reason" text;
ALTER TABLE public.sybil_v2_referral_invalidations ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.sybil_v2_reward_clearances ();
ALTER TABLE public.sybil_v2_reward_clearances ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public.sybil_v2_reward_clearances ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE public.sybil_v2_reward_clearances ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.sybil_v2_reward_clearances ADD COLUMN IF NOT EXISTS "verdict" text;
ALTER TABLE public.sybil_v2_reward_clearances ADD COLUMN IF NOT EXISTS "policy_version" text;
ALTER TABLE public.sybil_v2_reward_clearances ADD COLUMN IF NOT EXISTS "analyzer_version" text;
ALTER TABLE public.sybil_v2_reward_clearances ADD COLUMN IF NOT EXISTS "assessment_revision" bigint;
ALTER TABLE public.sybil_v2_reward_clearances ADD COLUMN IF NOT EXISTS "evidence_cutoff_block" bigint;
ALTER TABLE public.sybil_v2_reward_clearances ADD COLUMN IF NOT EXISTS "risk_score" integer;
ALTER TABLE public.sybil_v2_reward_clearances ADD COLUMN IF NOT EXISTS "reason_codes" jsonb;
ALTER TABLE public.sybil_v2_reward_clearances ADD COLUMN IF NOT EXISTS "evidence_digest" text;
ALTER TABLE public.sybil_v2_reward_clearances ADD COLUMN IF NOT EXISTS "issued_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.sybil_v2_wallet_restrictions ();
ALTER TABLE public.sybil_v2_wallet_restrictions ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public.sybil_v2_wallet_restrictions ADD COLUMN IF NOT EXISTS "wallet_address" text;
ALTER TABLE public.sybil_v2_wallet_restrictions ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.sybil_v2_wallet_restrictions ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public.sybil_v2_wallet_restrictions ADD COLUMN IF NOT EXISTS "reason_codes" jsonb;
ALTER TABLE public.sybil_v2_wallet_restrictions ADD COLUMN IF NOT EXISTS "evidence_summary" jsonb;
ALTER TABLE public.sybil_v2_wallet_restrictions ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE public.sybil_v2_wallet_restrictions ADD COLUMN IF NOT EXISTS "related_invite_code" text;
ALTER TABLE public.sybil_v2_wallet_restrictions ADD COLUMN IF NOT EXISTS "imposed_at" timestamp with time zone;
ALTER TABLE public.sybil_v2_wallet_restrictions ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
ALTER TABLE public.sybil_v2_wallet_restrictions ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.vebetter_round_allocations ();
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "id" bigint GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "app_id" text;
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "vebetter_round_id" bigint;
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "x_allocation_pool_address" text;
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "claim_tx_id" text;
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "claim_block_number" bigint;
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "claim_block_timestamp" timestamp with time zone;
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "recipient_wallet" text;
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "caller_wallet" text;
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "total_amount_wei" numeric(78,0);
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "unallocated_amount_wei" numeric(78,0);
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "team_allocation_amount_wei" numeric(78,0);
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "rewards_allocation_amount_wei" numeric(78,0);
ALTER TABLE public.vebetter_round_allocations ADD COLUMN IF NOT EXISTS "observed_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.vote_reconcile_scan_checkpoints ();
ALTER TABLE public.vote_reconcile_scan_checkpoints ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE public.vote_reconcile_scan_checkpoints ADD COLUMN IF NOT EXISTS "last_scanned_block" bigint;
ALTER TABLE public.vote_reconcile_scan_checkpoints ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS reward_admission_bridge.elastic_settlement_settings ();
ALTER TABLE reward_admission_bridge.elastic_settlement_settings ADD COLUMN IF NOT EXISTS "id" smallint;
ALTER TABLE reward_admission_bridge.elastic_settlement_settings ADD COLUMN IF NOT EXISTS "enabled" boolean;
ALTER TABLE reward_admission_bridge.elastic_settlement_settings ADD COLUMN IF NOT EXISTS "rollout_not_before" timestamp with time zone;
ALTER TABLE reward_admission_bridge.elastic_settlement_settings ADD COLUMN IF NOT EXISTS "close_grace_hours" integer;
ALTER TABLE reward_admission_bridge.elastic_settlement_settings ADD COLUMN IF NOT EXISTS "x_option_reserve_wei" numeric(78,0);
ALTER TABLE reward_admission_bridge.elastic_settlement_settings ADD COLUMN IF NOT EXISTS "min_real_reward_wei" numeric(78,0);
ALTER TABLE reward_admission_bridge.elastic_settlement_settings ADD COLUMN IF NOT EXISTS "policy_version" text;
ALTER TABLE reward_admission_bridge.elastic_settlement_settings ADD COLUMN IF NOT EXISTS "allow_protected_partial_settlement" boolean;

CREATE TABLE IF NOT EXISTS reward_admission_bridge.holds ();
ALTER TABLE reward_admission_bridge.holds ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE reward_admission_bridge.holds ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE reward_admission_bridge.holds ADD COLUMN IF NOT EXISTS "app_id" text;
ALTER TABLE reward_admission_bridge.holds ADD COLUMN IF NOT EXISTS "reward_cohort_round_id" bigint;
ALTER TABLE reward_admission_bridge.holds ADD COLUMN IF NOT EXISTS "funding_allocation_receipt_id" bigint;
ALTER TABLE reward_admission_bridge.holds ADD COLUMN IF NOT EXISTS "amount_wei" numeric(78,0);
ALTER TABLE reward_admission_bridge.holds ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE reward_admission_bridge.holds ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS reward_admission_bridge.shared_pool_settings ();
ALTER TABLE reward_admission_bridge.shared_pool_settings ADD COLUMN IF NOT EXISTS "id" integer;
ALTER TABLE reward_admission_bridge.shared_pool_settings ADD COLUMN IF NOT EXISTS "enabled" boolean;
ALTER TABLE reward_admission_bridge.shared_pool_settings ADD COLUMN IF NOT EXISTS "policy_version" text;
ALTER TABLE reward_admission_bridge.shared_pool_settings ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;
ALTER TABLE reward_admission_bridge.shared_pool_settings ADD COLUMN IF NOT EXISTS "enabled_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS reward_admission_bridge.vote_round_close_settings ();
ALTER TABLE reward_admission_bridge.vote_round_close_settings ADD COLUMN IF NOT EXISTS "id" smallint;
ALTER TABLE reward_admission_bridge.vote_round_close_settings ADD COLUMN IF NOT EXISTS "enabled" boolean;
ALTER TABLE reward_admission_bridge.vote_round_close_settings ADD COLUMN IF NOT EXISTS "first_vote_round_id" bigint;
ALTER TABLE reward_admission_bridge.vote_round_close_settings ADD COLUMN IF NOT EXISTS "grace_hours" integer;
ALTER TABLE reward_admission_bridge.vote_round_close_settings ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;
ALTER TABLE reward_admission_bridge.vote_round_close_settings ADD COLUMN IF NOT EXISTS "enabled_at" timestamp with time zone;
ALTER TABLE reward_admission_bridge.vote_round_close_settings ADD COLUMN IF NOT EXISTS "paused" boolean;
ALTER TABLE reward_admission_bridge.vote_round_close_settings ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;
ALTER TABLE reward_admission_bridge.vote_round_close_settings ADD COLUMN IF NOT EXISTS "pause_reason" text;

CREATE TABLE IF NOT EXISTS reward_admission_bridge.vote_window_fixed_quotes ();
ALTER TABLE reward_admission_bridge.vote_window_fixed_quotes ADD COLUMN IF NOT EXISTS "network" text;
ALTER TABLE reward_admission_bridge.vote_window_fixed_quotes ADD COLUMN IF NOT EXISTS "vote_round_id" bigint;
ALTER TABLE reward_admission_bridge.vote_window_fixed_quotes ADD COLUMN IF NOT EXISTS "source_cohort_round_id" bigint;
ALTER TABLE reward_admission_bridge.vote_window_fixed_quotes ADD COLUMN IF NOT EXISTS "participant_count" bigint;
ALTER TABLE reward_admission_bridge.vote_window_fixed_quotes ADD COLUMN IF NOT EXISTS "quote_wei" numeric(78,0);
ALTER TABLE reward_admission_bridge.vote_window_fixed_quotes ADD COLUMN IF NOT EXISTS "x_reserve_per_participant_wei" numeric(78,0);
ALTER TABLE reward_admission_bridge.vote_window_fixed_quotes ADD COLUMN IF NOT EXISTS "observed_pool_wei" numeric(78,0);
ALTER TABLE reward_admission_bridge.vote_window_fixed_quotes ADD COLUMN IF NOT EXISTS "fixed_outstanding_wei" numeric(78,0);
ALTER TABLE reward_admission_bridge.vote_window_fixed_quotes ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;
ALTER TABLE reward_admission_bridge.vote_window_fixed_quotes ADD COLUMN IF NOT EXISTS "legacy_participant_count" bigint;

CREATE TABLE IF NOT EXISTS reward_admission_bridge.vote_window_immediate_settings ();
ALTER TABLE reward_admission_bridge.vote_window_immediate_settings ADD COLUMN IF NOT EXISTS "id" smallint;
ALTER TABLE reward_admission_bridge.vote_window_immediate_settings ADD COLUMN IF NOT EXISTS "enabled" boolean;
ALTER TABLE reward_admission_bridge.vote_window_immediate_settings ADD COLUMN IF NOT EXISTS "first_vote_round_id" bigint;
ALTER TABLE reward_admission_bridge.vote_window_immediate_settings ADD COLUMN IF NOT EXISTS "last_vote_round_id" bigint;

-- Enforce the financial exact-once keys used by the actual functions.
CREATE UNIQUE INDEX retry_qa_clearance_revision ON public.sybil_v2_reward_clearances(invite_code,assessment_revision);
CREATE UNIQUE INDEX retry_qa_receipt_once ON public.reward_receipts(payout_id);
CREATE UNIQUE INDEX retry_qa_split_once ON public.reward_x_promotion_splits(invite_code);
CREATE UNIQUE INDEX retry_qa_obligation_once ON public.reward_x_promotion_obligations(split_id);
CREATE UNIQUE INDEX retry_qa_exemption_once ON public.reward_x_promotion_split_exemptions(queue_entry_id);

INSERT INTO public.reward_runtime_config
 (id,mainnet_funded_rewards_enabled,emergency_rewards_paused,sybil_v2_enforcement_enabled,reward_recovery_enabled,
  reward_x_promotion_enabled,reward_x_promotion_shadow_enabled,reward_x_promotion_live_started_at,
  reward_x_promotion_policy_version,reward_x_promotion_payout_enabled,
  reward_x_promotion_external_verification_ready,reward_x_promotion_external_verification_started_at,
  reward_x_promotion_v3_cutover_at)
VALUES (1,true,false,true,true,true,false,now()-interval '30 days',
 'x-promotion-withheld-10pct-v3',true,true,now()-interval '30 days',now()-interval '30 days');
INSERT INTO reward_admission_bridge.shared_pool_settings(id,enabled) VALUES(1,true);
INSERT INTO reward_admission_bridge.vote_round_close_settings(id,enabled,paused,first_vote_round_id,grace_hours)
VALUES(1,true,false,125,24);
INSERT INTO reward_admission_bridge.vote_window_immediate_settings(id,enabled,first_vote_round_id,last_vote_round_id)
VALUES(1,true,125,125);
INSERT INTO reward_admission_bridge.elastic_settlement_settings(id,enabled,x_option_reserve_wei,min_real_reward_wei)
VALUES(1,true,10000000000000000000,1);
INSERT INTO public.vote_reconcile_scan_checkpoints(network,last_scanned_block) VALUES('mainnet',5200);
INSERT INTO public.reward_x_promotion_external_runtime_checks(network,status,checked_at)
VALUES('mainnet','READY',now());
INSERT INTO public.referral_links(inviter_wallet,status,referral_key)
SELECT inviter_wallet,'ACTIVE','ABCDEFGHIJKLMNOP' FROM public.invitations WHERE invite_code='EDFW4Y7';
UPDATE public.invitations SET created_at=now()-interval '7 days' WHERE invite_code='EDFW4Y7';
UPDATE public.vebetter_round_allocations SET observed_at=now()-interval '2 days',
 rewards_allocation_amount_wei=100000000000000000000 WHERE vebetter_round_id IN(128,129);
UPDATE public.sybil_v2_referral_assessments SET policy_version='fixture-policy',
 analyzer_version='fixture-analyzer',reason_codes='[]',source='SYSTEM'
 WHERE invite_code='EDFW4Y7';

CREATE OR REPLACE FUNCTION public.commit_reward_reservation(p_invite_code text, p_network text, p_observed_pool_balance_wei numeric, p_expected_reserved_before_wei numeric, p_amount_wei numeric, p_algorithm_version text, p_quote_snapshot_id bigint, p_finalized_block bigint, p_basis jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_network text := lower(btrim(p_network));
  v_invitation public.invitations%rowtype;
  v_queue public.reward_queue_entries%rowtype;
  v_clearance public.sybil_v2_reward_clearances%rowtype;
  v_existing_settlement public.reward_recovery_settlements%rowtype;
  v_settlement public.reward_recovery_settlements%rowtype;
  v_allocation_receipt public.vebetter_round_allocations%rowtype;
  v_obligation record;
  v_entry_class text;

  v_reserved numeric(78,0) := 0;
  v_elastic_self_escrow numeric(78,0) := 0;
  v_spendable_wei numeric(78,0) := 0;
  v_legacy_payout_reserved numeric(78,0) := 0;
  v_recovery_balance numeric(78,0) := 0;
  v_offset numeric(78,0) := 0;
  v_net numeric(78,0) := 0;
  v_remaining_offset numeric(78,0) := 0;
  v_take numeric(78,0) := 0;
  v_cohort_committed numeric(78,0) := 0;
  v_expected_cohort_committed numeric(78,0) := 0;
  v_adjustment numeric(78,0) := 0;
  v_budget numeric(78,0) := 0;
  v_completion_block bigint;
  v_completion_tx_index integer;
  v_completion_clause_index integer;
  v_completion_tx_id text;
  v_mainnet_enabled boolean;
  v_emergency_paused boolean;
  v_sybil_v2_enforced boolean := false;
  v_recovery_enabled boolean := false;
  v_now timestamptz := clock_timestamp();
  v_shared_pool_active boolean := false;
  v_basis jsonb;
begin
  if v_code is null or v_code='' then raise exception 'INVITE_CODE_REQUIRED'; end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then raise exception 'UNSUPPORTED_NETWORK'; end if;
  if p_observed_pool_balance_wei is null or p_observed_pool_balance_wei<0 or p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei) then raise exception 'INVALID_OBSERVED_POOL_BALANCE'; end if;
  if p_expected_reserved_before_wei is null or p_expected_reserved_before_wei<0 or p_expected_reserved_before_wei<>trunc(p_expected_reserved_before_wei) then raise exception 'INVALID_EXPECTED_RESERVED'; end if;
  if p_amount_wei is null or p_amount_wei<=0 or p_amount_wei<>trunc(p_amount_wei) then raise exception 'INVALID_REWARD_AMOUNT'; end if;
  if p_finalized_block is null or p_finalized_block<0 then raise exception 'INVALID_FINALIZED_BLOCK'; end if;
  if p_algorithm_version is null or length(btrim(p_algorithm_version)) not between 1 and 80 then raise exception 'INVALID_ALGORITHM_VERSION'; end if;
  if p_basis is null or jsonb_typeof(p_basis)<>'object' then raise exception 'INVALID_RESERVATION_BASIS'; end if;

  perform pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));

  select
    mainnet_funded_rewards_enabled,
    emergency_rewards_paused,
    sybil_v2_enforcement_enabled,
    reward_recovery_enabled
  into
    v_mainnet_enabled,
    v_emergency_paused,
    v_sybil_v2_enforced,
    v_recovery_enabled
  from public.reward_runtime_config
  where id=1;

  if not found then raise exception 'REWARD_RUNTIME_CONFIG_MISSING'; end if;
  select coalesce((select s.enabled from reward_admission_bridge.shared_pool_settings s where s.id=1),false)
    into v_shared_pool_active;
  if p_algorithm_version='shared-pool-v1' and not v_shared_pool_active then
    raise exception 'SHARED_POOL_ALGORITHM_NOT_ENABLED';
  end if;
  if v_emergency_paused then raise exception 'REWARD_RESERVATION_PAUSED'; end if;
  if v_network='mainnet' and not v_mainnet_enabled then raise exception 'REWARD_RESERVATION_DISABLED'; end if;

  -- Preserve the existing global network reservation lock. Recovery also uses
  -- a wallet lock below, always after this lock, so lock ordering is stable.
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_reward_reservation_' || v_network,0)
  );

  select * into v_invitation
  from public.invitations i
  where i.invite_code=v_code
  for update;

  if not found
     or v_invitation.activation_network<>v_network
     or v_invitation.status<>'COMPLETED'
     or v_invitation.reward_status<>'ELIGIBLE'
     or v_invitation.reward_eligible_at is null
     or v_invitation.sybil_status<>'CLEAR'
     or v_invitation.sybil_checked_at is null
     or v_invitation.impact_sync_complete_at is null
     or v_invitation.inviter_wallet is null
     or v_invitation.invitee_wallet is null
     or v_invitation.eligibility_check_id is null then
    return jsonb_build_object('reserved',false,'reason','NOT_ELIGIBLE');
  end if;

  select c.* into v_clearance
  from public.sybil_v2_reward_clearances c
  join public.sybil_v2_referral_assessments a
    on a.invite_code=c.invite_code
   and a.revision=c.assessment_revision
   and a.state=c.verdict
  where c.invite_code=v_code
    and c.network=v_network
    and c.verdict='CLEAR';

  if v_sybil_v2_enforced and not found then
    return jsonb_build_object('reserved',false,'reason','SYBIL_V2_CLEARANCE_MISSING');
  end if;

  if v_sybil_v2_enforced and exists (
    select 1
    from public.sybil_v2_wallet_restrictions r
    where r.network=v_network
      and r.status='ACTIVE'
      and r.wallet_address in (
        lower(v_invitation.inviter_wallet),
        lower(v_invitation.invitee_wallet)
      )
  ) then
    return jsonb_build_object('reserved',false,'reason','SYBIL_V2_RESTRICTED');
  end if;

  if exists (
    select 1
    from public.reward_reservation_legacy_exclusions x
    where x.invite_code=v_code
  ) then
    return jsonb_build_object('reserved',false,'reason','LEGACY_EXCLUDED');
  end if;

  select * into v_queue
  from public.reward_queue_entries q
  where q.invite_code=v_code
  for update;

  if found then
    if v_queue.reserved_amount_wei is not null then
      return jsonb_build_object(
        'reserved',true,
        'reason','ALREADY_RESERVED',
        'inviteCode',v_queue.invite_code,
        'amountWei',v_queue.reserved_amount_wei::text,
        'reservedAt',v_queue.reserved_at,
        'status',v_queue.status
      );
    end if;
    return jsonb_build_object('reserved',false,'reason','LEGACY_QUEUE_ENTRY');
  end if;

  select * into v_existing_settlement
  from public.reward_recovery_settlements s
  where s.invite_code=v_code
  for update;

  if found then
    return jsonb_build_object(
      'reserved',true,
      'reason','ALREADY_RECOVERY_SETTLED',
      'inviteCode',v_existing_settlement.invite_code,
      'amountWei',v_existing_settlement.net_amount_wei::text,
      'reservedAt',v_existing_settlement.settled_at,
      'status',case
        when v_existing_settlement.net_amount_wei=0 then 'RECOVERY_SETTLED'
        else 'AWAITING_CLAIM'
      end
    );
  end if;

  select
    e.block_number::bigint,
    e.tx_index::integer,
    e.clause_index::integer,
    lower(e.tx_id)
  into
    v_completion_block,
    v_completion_tx_index,
    v_completion_clause_index,
    v_completion_tx_id
  from public.invite_impact_events e
  where e.invite_code=v_code
    and e.network=v_network
    and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
    and e.block_number is not null
    and e.tx_index is not null
    and e.clause_index is not null
  order by e.block_number desc,e.tx_index desc,e.clause_index desc
  limit 1;

  if v_completion_block is null
     or v_completion_tx_index is null
     or v_completion_clause_index is null then
    return jsonb_build_object('reserved',false,'reason','COMPLETION_POSITION_MISSING');
  end if;

  if v_completion_block>p_finalized_block then
    return jsonb_build_object(
      'reserved',false,
      'reason','AWAITING_FINALITY',
      'completionBlock',v_completion_block,
      'finalizedBlock',p_finalized_block
    );
  end if;

  select e.entry_class into v_entry_class
  from public.eligibility_check_events e
  where e.id=v_invitation.eligibility_check_id
    and e.invite_code=v_code
    and e.wallet_address=lower(v_invitation.invitee_wallet)
    and e.network=v_network
    and e.outcome='ELIGIBLE'
    and e.entry_class in ('NEW','RETURNING');

  if v_entry_class not in ('NEW','RETURNING') then
    return jsonb_build_object('reserved',false,'reason','ENTRY_PROOF_MISSING');
  end if;

  -- Use the single authoritative liability reader so reservation-time pool
  -- protection includes any post-base LIVE X promotion obligation exactly
  -- once. With LIVE disabled this is numerically identical to the legacy
  -- queue + legacy-payout calculation.
  v_reserved := public.read_outstanding_reward_liability(
    v_network,
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
  )::numeric;

  if v_reserved<>p_expected_reserved_before_wei then
    return jsonb_build_object(
      'reserved',false,
      'reason','RECALCULATE',
      'reservedExistingWei',v_reserved::text
    );
  end if;

  v_net:=p_amount_wei;

  if v_recovery_enabled then
    if not (p_basis ? 'cohortReservedWei')
       or coalesce(p_basis->>'cohortReservedWei','') !~ '^[0-9]+$' then
      raise exception 'INVALID_EXPECTED_COHORT_COMMITTED';
    end if;

    v_expected_cohort_committed :=
      (p_basis->>'cohortReservedWei')::numeric;

    select * into v_allocation_receipt
    from public.vebetter_round_allocations a
    where a.id=v_invitation.reward_funding_allocation_receipt_id;

    if not found
       or v_allocation_receipt.network<>v_network
       or v_allocation_receipt.vebetter_round_id+1<>
          v_invitation.reward_cohort_round_id then
      raise exception 'REWARD_COHORT_FUNDING_MISMATCH';
    end if;

    v_cohort_committed:=public.read_reward_cohort_committed_wei(
      v_network,
      v_allocation_receipt.app_id,
      v_invitation.reward_cohort_round_id,
      v_allocation_receipt.id
    );

    if v_cohort_committed<>v_expected_cohort_committed then
      return jsonb_build_object(
        'reserved',false,
        'reason','RECALCULATE',
        'cohortCommittedWei',v_cohort_committed::text
      );
    end if;


    perform pg_advisory_xact_lock(
      hashtextextended(
        'veinvite_reward_recovery_' || v_network || '_' ||
        lower(v_invitation.inviter_wallet),
        0
      )
    );

    v_recovery_balance:=public.read_reward_recovery_balance_wei(
      v_network,
      lower(v_invitation.inviter_wallet)
    );
    v_offset:=least(p_amount_wei,v_recovery_balance);
    v_net:=p_amount_wei-v_offset;
  end if;

  -- Preserve the original pool guard for normal users. Recovery users reserve
  -- only the amount that will actually be transferred on-chain.
  -- A future cohort's still-unspent allocation is included in the global
  -- reserved amount. The existing canonical signer must release that SAME
  -- cohort's own escrow for the exact reservation being converted.
  -- All other payouts and older cohorts still use the original guard.
  IF p_algorithm_version='elastic-closed-cohort-v1' THEN
    IF coalesce(p_basis->'elasticClosure'->>'policy','')<>'elastic-closed-cohort-v1'
       OR v_invitation.reward_cohort_round_id IS NULL
       OR v_invitation.reward_funding_allocation_receipt_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM reward_admission_bridge.elastic_settlement_settings e
         WHERE e.id=1 AND e.enabled AND e.allow_protected_partial_settlement
           AND v_invitation.activated_at>=e.rollout_not_before
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.vebetter_round_allocations a
         JOIN reward_admission_bridge.elastic_settlement_settings e ON e.id=1
         WHERE a.network=v_network
           AND a.app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
           AND a.vebetter_round_id=v_invitation.reward_cohort_round_id
           AND a.observed_at+make_interval(hours=>e.close_grace_hours)
               <=clock_timestamp()
       )
    THEN RAISE EXCEPTION 'ELASTIC_CANONICAL_SELF_ESCROW_AUTHORITY_MISSING';
    END IF;
    v_elastic_self_escrow :=
      public.read_reward_elastic_contingent_scope_liability_wei_v1(
        v_network,
        '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
        v_invitation.reward_cohort_round_id,
        v_invitation.reward_funding_allocation_receipt_id
      );
    IF v_elastic_self_escrow<p_amount_wei THEN
      RETURN jsonb_build_object(
        'reserved',false,'reason','RECALCULATE',
        'remainingOwnEscrowWei',v_elastic_self_escrow::text);
    END IF;
  END IF;
  -- GLOBAL insolvency is never bypassed, even for a future elastic cohort.
  v_spendable_wei:=greatest(
    p_observed_pool_balance_wei-v_reserved+v_elastic_self_escrow,0);
  if p_observed_pool_balance_wei<v_reserved OR v_net>v_spendable_wei then
    return jsonb_build_object(
      'reserved',false,
      'reason','RECALCULATE',
      'reservedExistingWei',v_reserved::text,
      'availableWei',v_spendable_wei::text
    );
  end if;

  v_basis:=p_basis || jsonb_build_object(
    'observedPoolBalanceWei',p_observed_pool_balance_wei::text,
    'reservedBeforeWei',v_reserved::text,
    'finalizedBlock',p_finalized_block,
    'sybilV2Enforced',v_sybil_v2_enforced,
    'sybilClearanceId',case when v_sybil_v2_enforced then v_clearance.id::text else null end,
    'sybilVerdict',case when v_sybil_v2_enforced then v_clearance.verdict else null end,
    'sybilAssessmentRevision',case when v_sybil_v2_enforced then v_clearance.assessment_revision else null end
  );

  if v_offset>0 then
    if v_completion_tx_id is null
       or v_completion_tx_id !~ '^0x[0-9a-f]{64}$' then
      return jsonb_build_object(
        'reserved',false,
        'reason','COMPLETION_TX_ID_MISSING'
      );
    end if;

    -- Gross remains the cohort pricing commitment. Net remains the actual
    -- transfer liability. This keeps same-cohort pricing deterministic while
    -- ensuring withheld value does not occupy the on-chain payout pool.
    select * into v_allocation_receipt
    from public.vebetter_round_allocations a
    where a.id=v_invitation.reward_funding_allocation_receipt_id;

    if not found
       or v_allocation_receipt.network<>v_network
       or v_allocation_receipt.vebetter_round_id+1<>
          v_invitation.reward_cohort_round_id then
      raise exception 'REWARD_COHORT_FUNDING_MISMATCH';
    end if;

    select coalesce(sum(a.amount_wei),0)
    into v_adjustment
    from public.reward_cohort_funding_adjustments a
    where a.network=v_allocation_receipt.network
      and a.app_id=v_allocation_receipt.app_id
      and a.reward_cohort_round_id=v_invitation.reward_cohort_round_id
      and a.allocation_receipt_id=v_allocation_receipt.id;

    v_budget:=public.read_reward_cohort_effective_budget_wei(v_network,v_allocation_receipt.app_id,v_invitation.reward_cohort_round_id,v_allocation_receipt.id);
    v_cohort_committed:=public.read_reward_cohort_committed_wei(
      v_network,
      v_allocation_receipt.app_id,
      v_invitation.reward_cohort_round_id,
      v_allocation_receipt.id
    );

    if p_algorithm_version<>'shared-pool-v1' and v_cohort_committed+p_amount_wei>v_budget then
      return jsonb_build_object(
        'reserved',false,
        'reason','RECALCULATE',
        'cohortCommittedWei',v_cohort_committed::text,
        'cohortBudgetWei',v_budget::text
      );
    end if;

    insert into public.reward_recovery_settlements(
      network,invite_code,recipient_wallet,settlement_kind,state,
      gross_amount_wei,offset_amount_wei,net_amount_wei,sybil_clearance_id,
      completion_block,completion_tx_index,completion_clause_index,completion_tx_id,
      settled_at,updated_at
    ) values (
      v_network,
      v_code,
      lower(v_invitation.inviter_wallet),
      case when v_net=0 then 'FULL_OFFSET' else 'PARTIAL_OFFSET' end,
      'ACTIVE',
      p_amount_wei,
      v_offset,
      v_net,
      case when v_sybil_v2_enforced then v_clearance.id else null end,
      v_completion_block,
      v_completion_tx_index,
      v_completion_clause_index,
      v_completion_tx_id,
      v_now,
      v_now
    )
    returning * into v_settlement;

    v_remaining_offset:=v_offset;

    for v_obligation in
      with consumed as (
        select
          a.obligation_id,
          coalesce(sum(a.amount_wei),0)::numeric as consumed_wei
        from public.reward_recovery_allocations a
        group by a.obligation_id
      )
      select
        o.id,
        greatest(o.amount_wei-coalesce(c.consumed_wei,0),0)::numeric
          as remaining_wei
      from public.reward_recovery_obligations o
      left join consumed c on c.obligation_id=o.id
      where o.network=v_network
        and o.recipient_wallet=lower(v_invitation.inviter_wallet)
        and o.status='ACTIVE'
        and greatest(o.amount_wei-coalesce(c.consumed_wei,0),0)>0
      order by o.created_at,o.id
    loop
      exit when v_remaining_offset<=0;
      v_take:=least(v_remaining_offset,v_obligation.remaining_wei);

      insert into public.reward_recovery_allocations(
        settlement_id,obligation_id,amount_wei
      ) values (
        v_settlement.id,v_obligation.id,v_take
      );

      v_remaining_offset:=v_remaining_offset-v_take;
    end loop;

    if v_remaining_offset<>0 then
      raise exception 'REWARD_RECOVERY_ALLOCATION_MISMATCH';
    end if;

    v_basis:=v_basis || jsonb_build_object(
      'recoverySettlementId',v_settlement.id::text,
      'grossRewardWei',p_amount_wei::text,
      'recoveryOffsetWei',v_offset::text,
      'netPayableWei',v_net::text
    );
  end if;

  if v_net>0 then
    insert into public.reward_queue_entries(
      invite_code,recipient_wallet,eligibility_check_id,entry_class,network,eligible_at,status,
      reserved_amount_wei,reserved_at,reservation_algorithm_version,reservation_quote_snapshot_id,
      reservation_completion_block,reservation_completion_tx_index,reservation_completion_clause_index,
      reservation_basis,sybil_clearance_id
    ) values (
      v_code,
      lower(v_invitation.inviter_wallet),
      v_invitation.eligibility_check_id,
      v_entry_class,
      v_network,
      v_invitation.reward_eligible_at,
      'AWAITING_CLAIM',
      v_net,
      v_now,
      btrim(p_algorithm_version),
      p_quote_snapshot_id,
      v_completion_block,
      v_completion_tx_index,
      v_completion_clause_index,
      v_basis,
      case when v_sybil_v2_enforced then v_clearance.id else null end
    )
    returning * into v_queue;

    return jsonb_build_object(
      'reserved',true,
      'reason',case when v_offset>0 then 'RECOVERY_PARTIAL_RESERVED' else 'RESERVED' end,
      'inviteCode',v_queue.invite_code,
      'amountWei',v_queue.reserved_amount_wei::text,
      'reservedAt',v_queue.reserved_at,
      'status',v_queue.status,
      'completionBlock',v_queue.reservation_completion_block,
      'completionTxIndex',v_queue.reservation_completion_tx_index,
      'completionClauseIndex',v_queue.reservation_completion_clause_index,
      'sybilClearanceId',v_queue.sybil_clearance_id
    );
  end if;

  if v_offset<=0 or v_settlement.id is null then
    raise exception 'REWARD_RECOVERY_FULL_OFFSET_STATE_INVALID';
  end if;

  -- Full offset has no token transfer, queue row, payout or receipt. It still
  -- settles the valid referral, releases the slot and records one bell-only
  -- policy notice.
  update public.invitations i
  set slot_released_at=coalesce(i.slot_released_at,v_now)
  where i.invite_code=v_code
    and i.status='COMPLETED';

  insert into public.invite_notification_history(
    inviter_wallet,recipient_wallet,invite_code,kind,stage,event_at,
    reward_amount_wei,dapp_progress,collapsed_progress,friend_wallet,dedupe_key
  ) values (
    lower(v_invitation.inviter_wallet),
    lower(v_invitation.inviter_wallet),
    v_code,
    'REWARD_ADJUSTED',
    4,
    v_now,
    null,
    null,
    false,
    lower(v_invitation.invitee_wallet),
    'reward-recovery-adjusted:' || v_settlement.id::text
  )
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object(
    'reserved',true,
    'reason','RECOVERY_FULLY_SETTLED',
    'inviteCode',v_code,
    'amountWei','0',
    'reservedAt',v_now,
    'status','RECOVERY_SETTLED',
    'completionBlock',v_completion_block,
    'completionTxIndex',v_completion_tx_index,
    'completionClauseIndex',v_completion_clause_index,
    'sybilClearanceId',case when v_sybil_v2_enforced then v_clearance.id else null end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.commit_reward_shared_pool_v1(p_invite_code text, p_network text, p_observed_pool_balance_wei numeric, p_observed_at timestamp with time zone, p_finalized_block bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
 v_code text:=upper(btrim(coalesce(p_invite_code,'')));
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_inv public.invitations%rowtype;
 v_alloc public.vebetter_round_allocations%rowtype;
 v_cfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_candidates bigint;
 v_legacy_candidates bigint;
 v_candidate_present boolean;
 v_reserved numeric(78,0);
 v_headroom numeric(78,0);
 v_x_budget numeric(78,0);
 v_quote numeric(78,0);
 v_cohort_reserved numeric(78,0);
 v_basis jsonb;
 v_result jsonb;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging')
    OR v_code !~ '^[A-HJ-NP-Z2-9]{7}$'
    OR p_observed_pool_balance_wei IS NULL OR p_observed_pool_balance_wei<0
    OR p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei)
    OR p_observed_at IS NULL
    OR p_observed_at<clock_timestamp()-interval '120 seconds'
    OR p_observed_at>clock_timestamp()+interval '10 seconds'
    OR p_finalized_block IS NULL OR p_finalized_block<1
 THEN RAISE EXCEPTION 'SHARED_POOL_INPUT_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.shared_pool_settings s
    WHERE s.id=1 AND s.enabled) THEN
   RETURN jsonb_build_object('mode','DISABLED','reserved',false);
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||p_network,0));
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.holds h
    WHERE h.network=p_network AND h.invite_code=v_code AND h.status='HELD') THEN
   RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','HELD_ADMISSION_CONFLICT');
 END IF;

 SELECT * INTO v_inv FROM public.invitations i
   WHERE i.invite_code=v_code AND i.activation_network=p_network FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','INVITE_NOT_FOUND'); END IF;

 SELECT * INTO v_alloc FROM public.vebetter_round_allocations a
   WHERE a.id=v_inv.reward_funding_allocation_receipt_id
     AND a.network=p_network AND a.app_id=v_app
     AND a.vebetter_round_id+1=v_inv.reward_cohort_round_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','FUNDING_BINDING_MISSING'); END IF;

 -- The exact canonical candidate query already requires completed missions,
 -- live Sybil CLEAR + security-client checks, blockchain proof and no prior
 -- queue, payout or recovery. Count ONLY finalized eligible entries. Never
 -- dilute/escrow against unfinished participants or unaccepted invitations.
 SELECT count(*),coalesce(bool_or(c.invite_code=v_code),false),
   count(*) FILTER (WHERE public.reward_x_promotion_policy_for_invitation_v3(c.invite_code)='x-promotion-additive-v2')
 INTO v_candidates,v_candidate_present,v_legacy_candidates
 FROM public.read_reward_reservation_candidates_v2(p_network,100) c
 WHERE c.completion_block<=p_finalized_block;
 IF NOT v_candidate_present THEN
   RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','NOT_FINAL_ELIGIBLE');
 END IF;
 IF v_candidates=0 OR v_candidates>=100 THEN
   RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','UNBOUNDED_CANDIDATE_COUNT');
 END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR v_cfg.x_option_reserve_wei IS NULL OR v_cfg.x_option_reserve_wei<0
 THEN RAISE EXCEPTION 'SHARED_POOL_X_POLICY_UNAVAILABLE'; END IF;

 v_reserved:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
 IF v_reserved<0 OR v_reserved>p_observed_pool_balance_wei THEN
   RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','OUTSTANDING_EXCEEDS_POOL');
 END IF;
 v_headroom:=p_observed_pool_balance_wei-v_reserved;
 v_x_budget:=v_legacy_candidates*v_cfg.x_option_reserve_wei;
 IF v_headroom<=v_x_budget THEN
   RETURN jsonb_build_object('mode','DEFER','reserved',false,'reason','POOL_INSUFFICIENT_FOR_CURRENT_COMPLETIONS');
 END IF;
 v_quote:=public.calculate_reward_policy_aware_quote_v1(
   v_headroom,v_candidates,v_legacy_candidates,v_cfg.x_option_reserve_wei);
 IF v_quote<v_cfg.min_real_reward_wei THEN
   RETURN jsonb_build_object('mode','DEFER','reserved',false,'reason','REWARD_FUNDING_UNAVAILABLE');
 END IF;

 v_cohort_reserved:=public.read_reward_cohort_committed_wei(
    p_network,v_app,v_inv.reward_cohort_round_id,v_inv.reward_funding_allocation_receipt_id);
 v_basis:=jsonb_build_object(
    'quoteKind','shared_pool_completion_v1',
    'poolPolicy','shared-pool-v1',
    'fundingAllocationReceiptId',v_alloc.id::text,
    'rewardCohortRoundId',v_inv.reward_cohort_round_id::text,
    'cohortReservedWei',v_cohort_reserved::text,
    'observedPoolBalanceWei',p_observed_pool_balance_wei::text,
    'reservedBeforeWei',v_reserved::text,
    'eligibleReadyCount',v_candidates,
    'xOptionReservedPerEligibleWei',v_cfg.x_option_reserve_wei::text,
    'legacyXEligibleCount',v_legacy_candidates,
    'legacyXReserveTotalWei',v_x_budget::text,
    'quoteWei',v_quote::text,
    'observationAt',p_observed_at);
 v_result:=public.commit_reward_reservation(
    v_code,p_network,p_observed_pool_balance_wei,v_reserved,v_quote,
    'shared-pool-v1',null,p_finalized_block,v_basis);

 RETURN v_result||jsonb_build_object(
    'mode',case when coalesce((v_result->>'reserved')::boolean,false)
      then 'SHARED_RESERVED' else 'SHARED_REJECTED' end,
    'policy','shared-pool-v1');
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_reward_x_promotion_live_split_from_queue()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_cfg public.reward_runtime_config%rowtype;
  v_invitation public.invitations%rowtype;
  v_calc record;
  v_runtime jsonb;
  v_policy text;
begin
  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  if new.reserved_amount_wei is null
     or new.reserved_amount_wei<=0
     or new.reserved_at is null then
    return new;
  end if;

  v_policy:=public.reward_x_promotion_policy_for_invitation_v3(new.invite_code);
  if not v_cfg.reward_x_promotion_enabled then
    if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_PAUSED_NO_UNSPLIT_FALLBACK'; end if;
    if v_cfg.reward_x_promotion_live_started_at is not null
       and new.reserved_at>=v_cfg.reward_x_promotion_live_started_at then
      perform public.record_reward_x_promotion_split_exemption_v1(
        new.id,
        new.invite_code,
        'FEATURE_DISABLED_AFTER_LIVE_START',
        '{}'::jsonb
      );
    end if;
    return new;
  end if;

  if v_cfg.reward_x_promotion_live_started_at is null then
    if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_LIVE_START_MISSING'; end if;
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'LIVE_START_MISSING',
      '{}'::jsonb
    );
    return new;
  end if;

  if new.reserved_at<v_cfg.reward_x_promotion_live_started_at then
    return new;
  end if;

  if v_cfg.reward_x_promotion_policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3') then
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'POLICY_UNSUPPORTED',
      jsonb_build_object(
        'policyVersion',
        coalesce(v_cfg.reward_x_promotion_policy_version,'')
      )
    );
    return new;
  end if;

  if not v_cfg.reward_x_promotion_payout_enabled
     or not v_cfg.reward_x_promotion_external_verification_ready then
    if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_EXTERNAL_DISABLED'; end if;
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'DEPENDENCY_GATE_NOT_READY',
      jsonb_build_object(
        'payoutEnabled',
        v_cfg.reward_x_promotion_payout_enabled,
        'externalVerificationReady',
        v_cfg.reward_x_promotion_external_verification_ready
      )
    );
    return new;
  end if;

  if v_cfg.reward_x_promotion_external_verification_started_at is null then
    if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_EXTERNAL_START_MISSING'; end if;
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'EXTERNAL_READY_START_MISSING',
      '{}'::jsonb
    );
    return new;
  end if;

  if new.reserved_at<v_cfg.reward_x_promotion_external_verification_started_at then
    if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_EXTERNAL_TOO_EARLY'; end if;
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'BEFORE_EXTERNAL_READY_START',
      '{}'::jsonb
    );
    return new;
  end if;

  begin
    v_runtime :=
      public.read_reward_x_promotion_external_runtime_readiness_v1(
        new.network,
        1200
      );

    if not coalesce((v_runtime->>'ready')::boolean,false) then
    if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_RUNTIME_NOT_READY'; end if;
      perform public.record_reward_x_promotion_split_exemption_v1(
        new.id,
        new.invite_code,
        'EXTERNAL_RUNTIME_NOT_READY',
        jsonb_build_object(
          'runtimeReason',
          coalesce(v_runtime->>'reason','UNKNOWN')
        )
      );
      return new;
    end if;

    if not exists (
      select 1
      from public.referral_links r
      where lower(r.inviter_wallet)=lower(new.recipient_wallet)
        and r.status='ACTIVE'
        and r.referral_key ~ '^(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})$'
    ) then
      if v_policy='x-promotion-withheld-10pct-v3' then raise exception 'REWARD_X_V3_ACTIVE_REFERRAL_LINK_REQUIRED'; end if;
      perform public.record_reward_x_promotion_split_exemption_v1(
        new.id,
        new.invite_code,
        'ACTIVE_REFERRAL_LINK_MISSING',
        '{}'::jsonb
      );
      return new;
    end if;

    select * into v_invitation
    from public.invitations i
    where i.invite_code=new.invite_code;

    if not found
       or v_invitation.reward_cohort_round_id is null
       or v_invitation.reward_funding_allocation_receipt_id is null
       or lower(v_invitation.inviter_wallet)<>lower(new.recipient_wallet)
       or v_invitation.activation_network<>new.network then
      raise exception 'REWARD_X_PROMOTION_LIVE_SOURCE_MISSING';
    end if;

    select * into v_calc
    from public.calculate_reward_x_promotion_for_policy_v3(
      new.reserved_amount_wei,v_policy
    );

    insert into public.reward_x_promotion_splits(
      queue_entry_id,
      invite_code,
      network,
      recipient_wallet,
      reservation_amount_wei,
      base_amount_wei,
      promotion_amount_wei,
      source_reward_cohort_round_id,
      source_allocation_receipt_id,
      mode,
      policy_version,
      promotion_rate_bps,
      promotion_cap_wei
    ) values (
      new.id,
      new.invite_code,
      new.network,
      lower(new.recipient_wallet),
      new.reserved_amount_wei,
      v_calc.base_amount_wei,
      v_calc.promotion_amount_wei,
      v_invitation.reward_cohort_round_id,
      v_invitation.reward_funding_allocation_receipt_id,
      'LIVE',
      v_policy,
      v_calc.promotion_rate_bps,
      v_calc.promotion_cap_wei
    );
  exception when others then
    if v_policy='x-promotion-withheld-10pct-v3' then raise; end if;
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      case
        when sqlerrm like '%REWARD_X_PROMOTION_BONUS_BUDGET_EXCEEDED%'
          then 'PROMOTION_BUDGET_UNAVAILABLE'
        else 'SPLIT_CREATION_FAILED'
      end,
      jsonb_build_object('sqlstate',sqlstate)
    );
    return new;
  end;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_reward_queue_cohort_budget()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_invitation public.invitations%rowtype;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_budget numeric(78,0) := 0;
  v_committed numeric(78,0) := 0;
  v_delta numeric(78,0) := 0;
begin
  if new.reserved_amount_wei is null or new.status='CANCELLED' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_reward_reservation_' || new.network,0)
  );

  select * into v_invitation
  from public.invitations i
  where i.invite_code=new.invite_code;

  if not found
     or v_invitation.reward_cohort_round_id is null
     or v_invitation.reward_funding_allocation_receipt_id is null then
    raise exception 'REWARD_COHORT_BINDING_REQUIRED';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id=v_invitation.reward_funding_allocation_receipt_id;

  if not found
     or v_receipt.network<>new.network
     or v_receipt.vebetter_round_id+1<>v_invitation.reward_cohort_round_id then
    raise exception 'REWARD_COHORT_FUNDING_MISMATCH';
  end if;

  -- Already-verified global shared-pool reservations must not be invalidated
  -- by the former per-cohort cap. All identity/receipt checks above remain.
  -- The canonical writer is the only authorized creator of shared reservations.
  if new.reservation_algorithm_version='shared-pool-v1' then
    return new;
  end if;

  v_budget:=public.read_reward_cohort_effective_budget_wei(
    v_receipt.network,
    v_receipt.app_id,
    v_invitation.reward_cohort_round_id,
    v_receipt.id
  );

  -- Use the same cohort commitment authority as forecasting/reservation.
  -- It already accounts for recovery offsets and RELEASED X promotion value,
  -- preventing this final DB guard from diverging from planning.
  v_committed:=public.read_reward_cohort_committed_wei(
    v_receipt.network,
    v_receipt.app_id,
    v_invitation.reward_cohort_round_id,
    v_receipt.id
  );

  -- BEFORE INSERT: the new queue row is not yet part of v_committed.
  -- BEFORE UPDATE from CANCELLED: the row is likewise not committed yet.
  -- Updates among committed states are already represented in v_committed,
  -- so adding the reservation again would double-count the current row.
  if tg_op='INSERT' then
    v_delta:=new.reserved_amount_wei;
  elsif old.status='CANCELLED'
        and new.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED') then
    v_delta:=new.reserved_amount_wei;
  else
    v_delta:=0;
  end if;

  if v_committed+v_delta>v_budget then
    raise exception 'REWARD_COHORT_BUDGET_EXCEEDED';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_cohort_committed_wei(p_network text, p_app_id text, p_reward_cohort_round_id bigint, p_allocation_receipt_id bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_receipt public.vebetter_round_allocations%rowtype;
  v_queue_committed numeric(78,0) := 0;
  v_withheld_released numeric(78,0) := 0;
  v_offset_committed numeric(78,0) := 0;
  v_x_promotion_committed numeric(78,0) := 0;
  v_early_held numeric(78,0) := 0;
begin
  p_network:=lower(btrim(p_network));
  p_app_id:=lower(btrim(p_app_id));

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_reward_cohort_round_id is null or p_reward_cohort_round_id<1 then
    raise exception 'invalid reward cohort round';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id=p_allocation_receipt_id
    and a.network=p_network
    and a.app_id=p_app_id;

  if not found
     or v_receipt.vebetter_round_id+1<>p_reward_cohort_round_id then
    raise exception 'allocation receipt does not fund the requested reward cohort';
  end if;

  select coalesce(sum(q.reserved_amount_wei),0)
  into v_queue_committed
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code=q.invite_code
  where q.network=p_network
    and i.reward_funding_allocation_receipt_id=v_receipt.id
    and i.reward_cohort_round_id=p_reward_cohort_round_id
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED');

  -- Only v3 withholding is already included in the gross queue commitment.
  -- Returning it reduces lifetime commitment exactly once; a cancelled queue
  -- was excluded above, so it must never be subtracted again.
  select coalesce(sum(o.promotion_amount_wei),0)
  into v_withheld_released
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s on s.id=o.split_id
    and s.mode='LIVE' and s.policy_version='x-promotion-withheld-10pct-v3'
  join public.reward_queue_entries q on q.id=s.queue_entry_id
    and q.invite_code=o.invite_code and q.network=o.network
  where o.network=p_network
    and o.source_reward_cohort_round_id=p_reward_cohort_round_id
    and o.source_allocation_receipt_id=p_allocation_receipt_id
    and o.financial_state='RELEASED'
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED');
  if v_withheld_released>v_queue_committed then
    raise exception 'REWARD_X_V3_RELEASE_EXCEEDS_COHORT_COMMITMENT';
  end if;

  select coalesce(sum(s.offset_amount_wei),0)
  into v_offset_committed
  from public.reward_recovery_settlements s
  join public.invitations i on i.invite_code=s.invite_code
  where s.network=p_network
    and i.reward_funding_allocation_receipt_id=v_receipt.id
    and i.reward_cohort_round_id=p_reward_cohort_round_id
    and not public.is_sybil_v2_referral_invalidated(
      s.invite_code,
      p_network
    )
    and not exists (
      select 1
      from public.reward_recovery_obligations o
      where o.source_settlement_id=s.id
        and o.status='ACTIVE'
    );

  select coalesce(sum(o.promotion_amount_wei),0)
  into v_x_promotion_committed
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s
    on s.id=o.split_id
   and s.mode='LIVE'
   and s.policy_version='x-promotion-additive-v2'
  where o.network=p_network
    and o.source_reward_cohort_round_id=p_reward_cohort_round_id
    and o.source_allocation_receipt_id=p_allocation_receipt_id
    and o.financial_state in ('RESERVED','HELD','PAID');

  if v_x_promotion_committed<0 then
    raise exception 'REWARD_X_PROMOTION_NEGATIVE_COHORT_COMMITMENT';
  end if;

  -- Existing PAID and recovery offsets stay in lifetime spent, temporary
  -- HELD is added only until atomically converted to an immutable fixed entry.
  select coalesce(sum(h.amount_wei),0) into v_early_held
  from reward_admission_bridge.holds h
  where h.network=p_network and h.app_id=p_app_id and h.status='HELD'
    and h.reward_cohort_round_id=p_reward_cohort_round_id
    and h.funding_allocation_receipt_id=p_allocation_receipt_id;
  if v_early_held<0 then raise exception 'COHORT_ADMISSION_HOLD_CORRUPT'; end if;

  return
    v_early_held +
    (v_queue_committed-v_withheld_released) +
    v_x_promotion_committed +
    v_offset_committed;
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_reservation_candidates_v2(p_network text, p_limit integer DEFAULT 25)
 RETURNS TABLE(invite_code text, completion_block bigint, completion_tx_index integer, completion_clause_index integer, reward_cohort_round_id bigint, reward_funding_allocation_receipt_id bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with parameters as (
    select lower(btrim(p_network)) as network,
           greatest(1,least(coalesce(p_limit,25),100)) as row_limit
  )
  select
    i.invite_code,
    completion.block_number::bigint,
    completion.tx_index::integer,
    completion.clause_index::integer,
    i.reward_cohort_round_id,
    i.reward_funding_allocation_receipt_id
  from public.invitations i
  cross join parameters p
  left join public.sybil_v2_referral_assessments a
    on a.invite_code=i.invite_code
  left join public.sybil_v2_reward_clearances c
    on c.invite_code=i.invite_code
   and c.network=p.network
   and c.verdict='CLEAR'
   and c.verdict=a.state
   and c.assessment_revision=a.revision
  cross join lateral (
    select e.block_number,e.tx_index,e.clause_index
    from public.invite_impact_events e
    where e.invite_code=i.invite_code
      and e.network=p.network
      and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
      and e.block_number is not null
      and e.tx_index is not null
      and e.clause_index is not null
    order by e.block_number desc,e.tx_index desc,e.clause_index desc
    limit 1
  ) completion
  where i.activation_network=p.network
    and i.status='COMPLETED'
    and i.reward_status='ELIGIBLE'
    and i.reward_eligible_at is not null
    and i.sybil_status='CLEAR'
    and i.sybil_checked_at is not null
    and i.impact_sync_complete_at is not null
    and i.inviter_wallet is not null
    and i.invitee_wallet is not null
    and i.eligibility_check_id is not null
    and i.reward_cohort_round_id is not null
    and i.reward_funding_allocation_receipt_id is not null
    and (
      not public.sybil_v2_enforcement_enabled()
      or (a.state='CLEAR' and c.id is not null)
    )
    and (
      not public.sybil_v2_enforcement_enabled()
      or not exists (
        select 1
        from public.sybil_v2_wallet_restrictions r
        where r.network=p.network
          and r.status='ACTIVE'
          and r.wallet_address in (
            lower(i.inviter_wallet),
            lower(i.invitee_wallet)
          )
      )
    )
    and not exists (
      select 1 from public.reward_queue_entries q
      where q.invite_code=i.invite_code
    )
    and not exists (
      select 1 from public.reward_recovery_settlements s
      where s.invite_code=i.invite_code
    )
    and not exists (
      select 1 from public.reward_reservation_legacy_exclusions x
      where x.invite_code=i.invite_code
    )
  order by completion.block_number,completion.tx_index,completion.clause_index,i.invite_code
  limit (select row_limit from parameters);
$function$;

CREATE OR REPLACE FUNCTION public.validate_reward_x_promotion_split()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_queue public.reward_queue_entries%rowtype;
  v_invitation public.invitations%rowtype;
  v_cfg public.reward_runtime_config%rowtype;
  v_expected record;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_budget numeric(78,0) := 0;
  v_committed numeric(78,0) := 0;
begin
  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  if new.policy_version<>public.reward_x_promotion_policy_for_invitation_v3(new.invite_code) then
    raise exception 'REWARD_X_PROMOTION_POLICY_MISMATCH';
  end if;

  if new.policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3') then
    raise exception 'REWARD_X_PROMOTION_POLICY_UNSUPPORTED';
  end if;

  if new.mode='LIVE' and not v_cfg.reward_x_promotion_enabled then
    raise exception 'REWARD_X_PROMOTION_LIVE_DISABLED';
  end if;

  if new.mode='SHADOW' and not v_cfg.reward_x_promotion_shadow_enabled then
    raise exception 'REWARD_X_PROMOTION_SHADOW_DISABLED';
  end if;

  select * into v_queue
  from public.reward_queue_entries q
  where q.id=new.queue_entry_id;

  if not found
     or v_queue.invite_code<>new.invite_code
     or v_queue.network<>new.network
     or lower(v_queue.recipient_wallet)<>new.recipient_wallet
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei<>new.reservation_amount_wei
     or v_queue.reserved_at is null then
    raise exception 'REWARD_X_PROMOTION_QUEUE_MISMATCH';
  end if;

  if new.mode='SHADOW' and (
    v_cfg.reward_x_promotion_shadow_started_at is null
    or v_queue.reserved_at < v_cfg.reward_x_promotion_shadow_started_at
    or (
      v_cfg.reward_x_promotion_live_started_at is not null
      and v_queue.reserved_at >= v_cfg.reward_x_promotion_live_started_at
    )
  ) then
    raise exception 'REWARD_X_PROMOTION_OUTSIDE_SHADOW_WINDOW';
  end if;

  if new.mode='LIVE' and (
    v_cfg.reward_x_promotion_live_started_at is null
    or v_queue.reserved_at < v_cfg.reward_x_promotion_live_started_at
  ) then
    raise exception 'REWARD_X_PROMOTION_OUTSIDE_LIVE_WINDOW';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code=new.invite_code;

  if not found
     or lower(v_invitation.inviter_wallet)<>new.recipient_wallet
     or v_invitation.activation_network<>new.network
     or v_invitation.reward_cohort_round_id<>new.source_reward_cohort_round_id
     or v_invitation.reward_funding_allocation_receipt_id<>new.source_allocation_receipt_id then
    raise exception 'REWARD_X_PROMOTION_SOURCE_MISMATCH';
  end if;

  select * into v_expected
  from public.calculate_reward_x_promotion_for_policy_v3(
    new.reservation_amount_wei,new.policy_version
  );

  if new.base_amount_wei<>v_expected.base_amount_wei
     or new.promotion_amount_wei<>v_expected.promotion_amount_wei
     or new.promotion_rate_bps<>v_expected.promotion_rate_bps
     or new.promotion_cap_wei<>v_expected.promotion_cap_wei then
    raise exception 'REWARD_X_PROMOTION_CALCULATION_MISMATCH';
  end if;

  -- Protect the additional X 10 B3TR physically, but do not apply a
  -- superseded round cap to a shared-pool reservation.
  if new.mode='LIVE' and new.policy_version='x-promotion-additive-v2'
     and v_queue.reservation_algorithm_version='shared-pool-v1' then
    if coalesce(v_queue.reservation_basis->>'poolPolicy','')<>'shared-pool-v1'
       or coalesce(v_queue.reservation_basis->>'observedPoolBalanceWei','') !~ '^[0-9]+$'
       or (v_queue.reservation_basis->>'observedPoolBalanceWei')::numeric <
          public.read_outstanding_reward_liability(
            new.network,
            '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
          )::numeric + new.promotion_amount_wei
    then
      raise exception 'SHARED_POOL_X_BONUS_PHYSICAL_CAPACITY_EXCEEDED';
    end if;
  elsif new.mode='LIVE' and new.policy_version='x-promotion-additive-v2' then
    select * into v_receipt
    from public.vebetter_round_allocations a
    where a.id=new.source_allocation_receipt_id;

    if not found
       or v_receipt.network<>new.network
       or v_receipt.vebetter_round_id+1<>new.source_reward_cohort_round_id then
      raise exception 'REWARD_X_PROMOTION_SOURCE_MISMATCH';
    end if;

    -- The queue row already exists and is included in committed value. The
    -- additive X bonus is not, so reserve it explicitly before promising it.
    v_budget:=public.read_reward_cohort_effective_budget_wei(
      new.network,
      v_receipt.app_id,
      new.source_reward_cohort_round_id,
      new.source_allocation_receipt_id
    );
    v_committed:=public.read_reward_cohort_committed_wei(
      new.network,
      v_receipt.app_id,
      new.source_reward_cohort_round_id,
      new.source_allocation_receipt_id
    );

    if v_committed+new.promotion_amount_wei>v_budget then
      raise exception 'REWARD_X_PROMOTION_BONUS_BUDGET_EXCEEDED';
    end if;
  end if;

  if new.mode='LIVE' and exists (
    select 1
    from public.reward_payouts rp
    where rp.invite_code=new.invite_code
  ) then
    raise exception 'REWARD_X_PROMOTION_SPLIT_TOO_LATE';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.commit_reward_vote_round_close_batch_v1(p_invite_code text, p_network text, p_observed_pool_balance_wei numeric, p_observed_at timestamp with time zone, p_finalized_block bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_code text:=upper(btrim(coalesce(p_invite_code,'')));
 v_cfg reward_admission_bridge.vote_round_close_settings%rowtype;
 v_xcfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_inv public.invitations%rowtype;
 v_vote_round bigint;
 v_allocation_close timestamptz;
 v_round_close_block bigint;
 v_vote_scan_checkpoint bigint;
 v_completed bigint;
 v_verified bigint;
 v_legacy_verified bigint;
 v_vote_proofs bigint;
 v_prior bigint;
 v_prior_own bigint;
 v_held_count bigint;
 v_fixed numeric(78,0);
 v_provisional numeric(78,0);
 v_available numeric(78,0);
 v_quote numeric(78,0);
 v_before numeric(78,0);
 v_cohort_reserved numeric(78,0);
 v_basis jsonb;
 v_out jsonb;
 v_count bigint:=0;
 v_row record;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging')
    OR v_code !~ '^[A-HJ-NP-Z2-9]{7}$'
    OR p_observed_pool_balance_wei IS NULL OR p_observed_pool_balance_wei<0
    OR p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei)
    OR p_observed_at IS NULL
    OR p_observed_at<clock_timestamp()-interval '120 seconds'
    OR p_observed_at>clock_timestamp()+interval '10 seconds'
    OR p_finalized_block IS NULL OR p_finalized_block<1 THEN
   RAISE EXCEPTION 'VOTE_ROUND_CLOSE_INVALID_INPUT';
 END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.vote_round_close_settings WHERE id=1;
 IF NOT FOUND OR NOT v_cfg.enabled THEN
   RETURN jsonb_build_object('mode','DISABLED','reserved',false);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.shared_pool_settings s
     WHERE s.id=1 AND s.enabled) THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','SHARED_POOL_NOT_ACTIVE','reserved',false);
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||p_network,0));
 -- Read the pause flag under the same locks as the single-recipient writer.
 -- A pause request serializes with any in-flight batch instead of racing.
 SELECT * INTO v_cfg FROM reward_admission_bridge.vote_round_close_settings
 WHERE id=1 FOR SHARE;
 IF NOT FOUND OR NOT v_cfg.enabled OR v_cfg.paused THEN
   RETURN jsonb_build_object('mode','PAUSED','reason','ROUND_CLOSE_PAUSED',
     'reserved',false);
 END IF;
 IF EXISTS(SELECT 1 FROM public.reward_runtime_config r WHERE r.id=1
    AND (r.emergency_rewards_paused OR (p_network='mainnet' AND NOT r.mainnet_funded_rewards_enabled)))
 THEN RETURN jsonb_build_object('mode','BLOCKED','reason','RUNTIME_PAUSED','reserved',false); END IF;

 SELECT * INTO v_inv FROM public.invitations i
  WHERE i.invite_code=v_code AND i.activation_network=p_network FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','BLOCKED','reason','INVITE_MISSING','reserved',false); END IF;
 v_vote_round:=v_inv.vote_round_id;
 IF v_vote_round IS NULL OR v_vote_round<v_cfg.first_vote_round_id THEN
   RETURN jsonb_build_object('mode','LEGACY','reserved',false);
 END IF;
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.holds h
    WHERE h.network=p_network AND h.invite_code=v_code AND h.status='HELD') THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','HELD_ADMISSION_CONFLICT','reserved',false);
 END IF;
 IF v_inv.vote_completed IS NOT TRUE THEN
   RETURN jsonb_build_object('mode','DEFER','reason','MISSION_NOT_FINISHED','reserved',false);
 END IF;

 -- An official allocation receipt for THIS COMPLETION round marks its end.
 -- No unobserved elapsed week is inferred from a wall-clock assumption.
 SELECT max(a.observed_at),max(a.claim_block_number)
 INTO v_allocation_close,v_round_close_block
 FROM public.vebetter_round_allocations a
 WHERE a.network=p_network AND a.app_id=v_app
   AND a.vebetter_round_id=v_vote_round;
 IF v_allocation_close IS NULL OR
    clock_timestamp()<v_allocation_close+make_interval(hours=>v_cfg.grace_hours) THEN
   RETURN jsonb_build_object('mode','DEFER','reason','WAIT_FOR_OFFICIAL_ROUND_CLOSE',
     'voteRoundId',v_vote_round,'reserved',false);
 END IF;
 -- A receipt alone cannot prove that all finalized vote events were indexed.
 -- Otherwise an indexer delay can permanently exclude a later-synced winner
 -- after earlier entitlements have become immutable.
 IF v_round_close_block IS NULL OR
    p_finalized_block<v_round_close_block THEN
   RETURN jsonb_build_object('mode','DEFER','reason','WAIT_FOR_ROUND_CLOSE_FINALITY',
     'voteRoundId',v_vote_round,'reserved',false);
 END IF;
 SELECT c.last_scanned_block INTO v_vote_scan_checkpoint
 FROM public.vote_reconcile_scan_checkpoints c WHERE c.network=p_network;
 IF v_vote_scan_checkpoint IS NULL OR
    v_vote_scan_checkpoint<v_round_close_block THEN
   RETURN jsonb_build_object('mode','DEFER','reason','WAIT_FOR_VOTE_SCAN_CATCHUP',
     'voteRoundId',v_vote_round,'requiredBlock',v_round_close_block,
     'scannedBlock',v_vote_scan_checkpoint,'reserved',false);
 END IF;
 SELECT * INTO v_xcfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR v_xcfg.x_option_reserve_wei IS NULL
   OR v_xcfg.x_option_reserve_wei<0 THEN
   RAISE EXCEPTION 'VOTE_ROUND_X_RESERVE_UNAVAILABLE';
 END IF;

 -- Any existing reservation in this vote round must retain its original
 -- immutable amount: never mingle this new policy with legacy guarantees.
 SELECT count(*),count(*) FILTER (WHERE q.invite_code=v_code)
 INTO v_prior,v_prior_own
 FROM public.reward_queue_entries q
 JOIN public.invitations i ON i.invite_code=q.invite_code
 WHERE q.network=p_network AND i.vote_round_id=v_vote_round
   AND q.reserved_amount_wei IS NOT NULL AND q.status<>'CANCELLED';
 IF v_prior>0 THEN
   IF v_prior_own>0 THEN
     RETURN jsonb_build_object('mode','ALREADY_RESERVED','reason','IMMUTABLE_EXISTING',
       'reserved',true);
   END IF;
   RETURN jsonb_build_object('mode','BLOCKED','reason','MIXED_IMMUTABLE_ROUND',
     'reserved',false);
 END IF;

 -- Pending verified completions must never lose their equal share because
 -- Sybil/chain evidence sync lagged behind the first completed user.
 SELECT count(*) INTO v_completed FROM public.invitations i
 WHERE i.activation_network=p_network AND i.vote_round_id=v_vote_round
   AND i.vote_completed=true AND i.status<>'CANCELLED'
   AND i.sybil_status<>'BLOCKED'
   AND i.reward_status NOT IN ('FORFEITED','PAID')
   AND i.ineligible_at IS NULL;
 IF v_completed=0 OR v_completed>5000 THEN
   RETURN jsonb_build_object('mode','DEFER','reason','EMPTY_OR_UNBOUNDED_COMPLETIONS',
     'reserved',false);
 END IF;

 -- Vote completion must be proven on-chain IN the claimed final vote round,
 -- not only inferred from an app-side timestamp or original invite cohort.
 SELECT count(*) INTO v_vote_proofs FROM public.invitations i
 WHERE i.activation_network=p_network AND i.vote_round_id=v_vote_round
   AND i.vote_completed=true AND i.status<>'CANCELLED'
   AND i.sybil_status<>'BLOCKED'
   AND i.reward_status NOT IN ('FORFEITED','PAID')
   AND i.ineligible_at IS NULL
   AND EXISTS (
      SELECT 1 FROM public.invite_impact_events e
      WHERE e.invite_code=i.invite_code AND e.network=p_network
        AND e.event_type='ALLOCATION_VOTE' AND e.vote_round_id=v_vote_round
        AND e.block_number<=p_finalized_block);
 IF v_vote_proofs<>v_completed THEN
   RETURN jsonb_build_object('mode','DEFER','reason','AWAIT_FINAL_VOTE_PROOFS',
     'completed',v_completed,'proved',v_vote_proofs,'reserved',false);
 END IF;

 SELECT count(*),
   count(*) FILTER (WHERE public.reward_x_promotion_policy_for_invitation_v3(c.invite_code)='x-promotion-additive-v2')
 INTO v_verified,v_legacy_verified
 FROM public.read_reward_vote_round_candidates_v1(p_network,v_vote_round) c
 JOIN public.invitations i ON i.invite_code=c.invite_code
 WHERE i.vote_round_id=v_vote_round AND c.completion_block<=p_finalized_block;
 -- All entrants must have an unambiguous completion-round provenance.
 -- A pending Sybil or chain verification never gets silently priced as zero.
 IF v_verified<>v_completed THEN
   RETURN jsonb_build_object('mode','DEFER','reason','AWAIT_VERIFIED_COMPLETIONS',
     'completed',v_completed,'verified',v_verified,'reserved',false);
 END IF;

 v_fixed:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
 v_provisional:=public.read_reward_elastic_contingent_liability_wei_v1(
   p_network,v_app);
 -- Shared-pool mode explicitly makes unfinished cohort budgets provisional
 -- (zero physical liability). The existing canonical reservation writer
 -- already accounts for real base/X/HELD obligations in v_fixed.
 -- Do not replace or weaken that writer. Fail closed if the config changes.
 IF v_provisional IS NULL OR v_provisional<>0 THEN
   RETURN jsonb_build_object('mode','BLOCKED',
     'reason','SHARED_POOL_UNEXPECTED_PROVISIONAL_LIABILITY','reserved',false);
 END IF;
 IF v_fixed<0 OR v_fixed>p_observed_pool_balance_wei THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','FIXED_LIABILITY_UNDERFUNDED',
     'reserved',false);
 END IF;
 v_available:=p_observed_pool_balance_wei-v_fixed
   -v_legacy_verified*v_xcfg.x_option_reserve_wei;
 IF v_available<=0 THEN
   RETURN jsonb_build_object('mode','DEFER','reason','NO_SPENDABLE_POOL','reserved',false);
 END IF;
 v_quote:=public.calculate_reward_policy_aware_quote_v1(
   p_observed_pool_balance_wei-v_fixed,v_verified,v_legacy_verified,v_xcfg.x_option_reserve_wei);
 IF v_quote<v_xcfg.min_real_reward_wei THEN
   RETURN jsonb_build_object('mode','DEFER','reason','REWARD_UNDER_MINIMUM','reserved',false);
 END IF;

 FOR v_row IN
   SELECT c.invite_code,i.reward_cohort_round_id,
          i.reward_funding_allocation_receipt_id
   FROM public.read_reward_vote_round_candidates_v1(p_network,v_vote_round) c
   JOIN public.invitations i ON i.invite_code=c.invite_code
   WHERE i.vote_round_id=v_vote_round AND c.completion_block<=p_finalized_block
   ORDER BY c.completion_block,c.completion_tx_index,c.completion_clause_index,c.invite_code
 LOOP
   IF v_row.reward_cohort_round_id IS NULL OR
      v_row.reward_funding_allocation_receipt_id IS NULL THEN
     RAISE EXCEPTION 'VOTE_ROUND_COHORT_BINDING_MISSING';
   END IF;
   SELECT count(*) INTO v_held_count FROM reward_admission_bridge.holds h
   WHERE h.network=p_network AND h.invite_code=v_row.invite_code AND h.status='HELD';
   IF v_held_count>0 THEN RAISE EXCEPTION 'VOTE_ROUND_HELD_ENTRY_CONFLICT'; END IF;
   v_before:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
   v_cohort_reserved:=public.read_reward_cohort_committed_wei(p_network,v_app,
      v_row.reward_cohort_round_id,v_row.reward_funding_allocation_receipt_id);
   v_basis:=jsonb_build_object(
      'quoteKind','vote_round_close_equal_v1',
      'poolPolicy','shared-pool-v1',
      'roundClosePolicy','vote-round-close-equal-v1',
      'voteRoundId',v_vote_round::text,
      'batchVerifiedCount',v_verified,
      'quoteWei',v_quote::text,
      'cohortReservedWei',v_cohort_reserved::text,
      'fundingAllocationReceiptId',v_row.reward_funding_allocation_receipt_id::text,
      'rewardCohortRoundId',v_row.reward_cohort_round_id::text,
      'observedPoolBalanceWei',p_observed_pool_balance_wei::text,
      'reservedBeforeWei',v_before::text,
      'xOptionReservedPerEligibleWei',v_xcfg.x_option_reserve_wei::text,
      'legacyXEligibleCount',v_legacy_verified,
      'legacyXReserveTotalWei',(v_legacy_verified*v_xcfg.x_option_reserve_wei)::text,
      'officialCloseObservedAt',v_allocation_close,
      'observationAt',p_observed_at);
   v_out:=public.commit_reward_reservation(
      v_row.invite_code,p_network,p_observed_pool_balance_wei,
      v_before,v_quote,'shared-pool-v1',null,p_finalized_block,v_basis);
   IF v_out IS NULL OR coalesce((v_out->>'reserved')::boolean,false) IS NOT TRUE THEN
     -- Transaction abort means no participant receives a partial quote.
     RAISE EXCEPTION 'VOTE_ROUND_CLOSE_ATOMIC_RESERVATION_FAILED:%',
       coalesce(v_out->>'reason','UNKNOWN');
   END IF;
   v_count:=v_count+1;
 END LOOP;
 IF v_count<>v_verified THEN RAISE EXCEPTION 'VOTE_ROUND_CLOSE_INCOMPLETE_BATCH'; END IF;
 RETURN jsonb_build_object('mode','ROUND_BATCH_RESERVED','reserved',true,
   'count',v_count,'voteRoundId',v_vote_round,'amountWei',v_quote::text);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_vote_round_candidates_v1(p_network text, p_vote_round_id bigint)
 RETURNS TABLE(invite_code text, completion_block bigint, completion_tx_index integer, completion_clause_index integer, reward_cohort_round_id bigint, reward_funding_allocation_receipt_id bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with parameters as (
    select lower(btrim(p_network)) as network,
           p_vote_round_id AS target_round_id
  )
  select
    i.invite_code,
    completion.block_number::bigint,
    completion.tx_index::integer,
    completion.clause_index::integer,
    i.reward_cohort_round_id,
    i.reward_funding_allocation_receipt_id
  from public.invitations i
  cross join parameters p
  left join public.sybil_v2_referral_assessments a
    on a.invite_code=i.invite_code
  left join public.sybil_v2_reward_clearances c
    on c.invite_code=i.invite_code
   and c.network=p.network
   and c.verdict='CLEAR'
   and c.verdict=a.state
   and c.assessment_revision=a.revision
  cross join lateral (
    select e.block_number,e.tx_index,e.clause_index
    from public.invite_impact_events e
    where e.invite_code=i.invite_code
      and e.network=p.network
      and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
      and e.block_number is not null
      and e.tx_index is not null
      and e.clause_index is not null
    order by e.block_number desc,e.tx_index desc,e.clause_index desc
    limit 1
  ) completion
  where i.activation_network=p.network
    and i.vote_round_id=p.target_round_id
    and i.vote_completed=true
    and p.target_round_id>0
    and i.status='COMPLETED'
    and i.reward_status='ELIGIBLE'
    and i.reward_eligible_at is not null
    and i.sybil_status='CLEAR'
    and i.sybil_checked_at is not null
    and i.impact_sync_complete_at is not null
    and i.inviter_wallet is not null
    and i.invitee_wallet is not null
    and i.eligibility_check_id is not null
    and i.reward_cohort_round_id is not null
    and i.reward_funding_allocation_receipt_id is not null
    and (
      not public.sybil_v2_enforcement_enabled()
      or (a.state='CLEAR' and c.id is not null)
    )
    and (
      not public.sybil_v2_enforcement_enabled()
      or not exists (
        select 1
        from public.sybil_v2_wallet_restrictions r
        where r.network=p.network
          and r.status='ACTIVE'
          and r.wallet_address in (
            lower(i.inviter_wallet),
            lower(i.invitee_wallet)
          )
      )
    )
    and not exists (
      select 1 from public.reward_queue_entries q
      where q.invite_code=i.invite_code
    )
    and not exists (
      select 1 from public.reward_recovery_settlements s
      where s.invite_code=i.invite_code
    )
    and not exists (
      select 1 from public.reward_reservation_legacy_exclusions x
      where x.invite_code=i.invite_code
    )
  order by completion.block_number,completion.tx_index,completion.clause_index,i.invite_code
  ;
$function$;

CREATE OR REPLACE FUNCTION public.issue_sybil_v2_reward_clearance(p_invite_code text, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_invitation public.invitations%rowtype;
  v_existing public.sybil_v2_reward_clearances%rowtype;
  v_clearance public.sybil_v2_reward_clearances%rowtype;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then raise exception 'INVALID_INVITE_CODE'; end if;
  if p_expected_revision is null or p_expected_revision < 1 then raise exception 'INVALID_ASSESSMENT_REVISION'; end if;

  perform pg_advisory_xact_lock(hashtextextended('veinvite_sybil_v2_' || v_code,0));

  select * into v_existing
  from public.sybil_v2_reward_clearances c
  where c.invite_code = v_code
    and c.assessment_revision = p_expected_revision;

  if found then
    return jsonb_build_object(
      'issued', true,
      'reason', 'ALREADY_ISSUED',
      'reused', true,
      'clearanceId', v_existing.id,
      'verdict', v_existing.verdict,
      'assessmentRevision', v_existing.assessment_revision
    );
  end if;

  select * into v_assessment
  from public.sybil_v2_referral_assessments a
  where a.invite_code = v_code
  for update;

  if not found then
    return jsonb_build_object('issued',false,'reason','ASSESSMENT_MISSING');
  end if;

  if v_assessment.revision <> p_expected_revision then
    return jsonb_build_object(
      'issued', false,
      'reason', 'STALE_REVISION',
      'assessmentRevision', v_assessment.revision
    );
  end if;

  if v_assessment.state not in ('CLEAR','WATCH') then
    return jsonb_build_object('issued',false,'reason','ASSESSMENT_NOT_CLEAR','state',v_assessment.state);
  end if;

  if not (v_assessment.required_checks <@ v_assessment.completed_checks) then
    return jsonb_build_object('issued',false,'reason','REQUIRED_CHECKS_INCOMPLETE');
  end if;

  if v_assessment.evidence_cutoff_block is null then
    return jsonb_build_object('issued',false,'reason','EVIDENCE_CUTOFF_MISSING');
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code = v_code
  for update;

  if not found
     or v_invitation.status <> 'COMPLETED'
     or v_invitation.reward_status <> 'ELIGIBLE'
     or v_invitation.reward_eligible_at is null
     or v_invitation.sybil_status <> 'CLEAR'
     or v_invitation.sybil_checked_at is null
     or v_invitation.vote_completed is not true
     or v_invitation.vote_completed_block is null
     or v_invitation.inviter_wallet is null
     or v_invitation.invitee_wallet is null
     or v_assessment.evidence_cutoff_block < v_invitation.vote_completed_block
     or not public.security_identity_v2_observation_complete(
       v_invitation.identity_link_status,
       v_invitation.identity_link_checked_at,
       v_invitation.vote_completed_at,
       v_invitation.identity_link_policy_version,
       v_invitation.identity_link_evidence
     )
  then
    return jsonb_build_object('issued',false,'reason','INVITATION_NOT_READY');
  end if;

  if exists (
    select 1
    from public.sybil_v2_wallet_restrictions r
    where r.network = v_assessment.network
      and r.status = 'ACTIVE'
      and r.wallet_address in (
        lower(v_invitation.inviter_wallet),
        lower(v_invitation.invitee_wallet)
      )
  ) then
    return jsonb_build_object('issued',false,'reason','ACTIVE_WALLET_RESTRICTION');
  end if;

  insert into public.sybil_v2_reward_clearances(
    invite_code, network, verdict, policy_version, analyzer_version,
    assessment_revision, evidence_cutoff_block, risk_score, reason_codes,
    evidence_digest, issued_at
  ) values (
    v_code, v_assessment.network, v_assessment.state, v_assessment.policy_version,
    v_assessment.analyzer_version, v_assessment.revision,
    v_assessment.evidence_cutoff_block, v_assessment.risk_score,
    v_assessment.reason_codes,
    md5(v_assessment.evidence_summary::text),
    clock_timestamp()
  )
  returning * into v_clearance;

  return jsonb_build_object(
    'issued', true,
    'reason', 'ISSUED',
    'clearanceId', v_clearance.id,
    'verdict', v_clearance.verdict,
    'assessmentRevision', v_clearance.assessment_revision
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_reward_policy_aware_quote_v1(p_capacity_wei numeric, p_recipient_count bigint, p_legacy_count bigint, p_legacy_reserve_wei numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF p_capacity_wei<0 OR p_capacity_wei<>trunc(p_capacity_wei)
    OR p_recipient_count<1 OR p_recipient_count>5000
    OR p_legacy_count<0 OR p_legacy_count>p_recipient_count
    OR p_legacy_reserve_wei<0 OR p_legacy_reserve_wei<>trunc(p_legacy_reserve_wei)
  THEN RAISE EXCEPTION 'REWARD_POLICY_AWARE_QUOTE_INVALID_INPUT'; END IF;
  RETURN div(greatest(p_capacity_wei-p_legacy_count*p_legacy_reserve_wei,0),p_recipient_count::numeric);
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_reward_x_promotion_for_policy_v3(p_gross_wei numeric, p_policy text)
 RETURNS TABLE(base_amount_wei numeric, promotion_amount_wei numeric, promotion_rate_bps integer, promotion_cap_wei numeric)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
 if p_policy='x-promotion-additive-v2' then
   return query select * from public.calculate_reward_x_promotion_additive_v2(p_gross_wei);
 elsif p_policy='x-promotion-withheld-10pct-v3' then
   return query select * from public.calculate_reward_x_promotion_withheld_v3(p_gross_wei);
 else raise exception 'REWARD_X_PROMOTION_POLICY_UNSUPPORTED'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.calculate_reward_x_promotion_additive_v2(p_reservation_amount_wei numeric)
 RETURNS TABLE(base_amount_wei numeric, promotion_amount_wei numeric, promotion_rate_bps integer, promotion_cap_wei numeric)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_bonus_wei constant numeric(78,0) := 10000000000000000000;
  v_reservation numeric(78,0);
begin
  if p_reservation_amount_wei <= 0
     or p_reservation_amount_wei <> trunc(p_reservation_amount_wei) then
    raise exception 'REWARD_X_PROMOTION_INVALID_RESERVATION';
  end if;

  v_reservation := p_reservation_amount_wei::numeric(78,0);

  -- v2 is an additive campaign bonus. The immutable referral reservation is
  -- never reduced to fund the X promotion.
  return query
  select
    v_reservation,
    v_bonus_wei,
    0,
    v_bonus_wei;
end;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_reward_x_promotion_withheld_v3(p_reservation_amount_wei numeric)
 RETURNS TABLE(base_amount_wei numeric, promotion_amount_wei numeric, promotion_rate_bps integer, promotion_cap_wei numeric)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_gross numeric(78,0); v_x numeric(78,0);
begin
 if p_reservation_amount_wei<=0 or p_reservation_amount_wei<>trunc(p_reservation_amount_wei)
 then raise exception 'REWARD_X_PROMOTION_INVALID_RESERVATION'; end if;
 v_gross:=p_reservation_amount_wei::numeric(78,0);
 v_x:=div(v_gross,10::numeric);
 return query select v_gross-v_x,v_x,1000,v_gross;
end $function$;

CREATE OR REPLACE FUNCTION public.read_outstanding_reward_liability(p_network text, p_app_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_app_id text := lower(btrim(coalesce(p_app_id,'')));
  v_reserved_existing numeric(78,0) := 0;
  v_legacy_reserved numeric(78,0) := 0;
  v_post_base_promotion numeric(78,0) := 0;

  v_early_held numeric(78,0) := 0;
  v_elastic_contingent numeric(78,0) := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;

  if v_app_id<>v_veinvite_app_id then
    raise exception 'reward liability can only target the VeInvite app';
  end if;

  select coalesce(sum(q.reserved_amount_wei),0)
  into v_reserved_existing
  from public.reward_queue_entries q
  where q.network=v_network
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists (
      select 1
      from public.reward_payouts paid
      where paid.invite_code=q.invite_code
        and paid.status='PAID'
    );

  select coalesce(sum(rp.amount_wei),0)
  into v_legacy_reserved
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id=rp.round_id
  where rr.network=v_network
    and rr.app_id=v_app_id
    and rp.status in ('PENDING','SENDING','FAILED')
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code=rp.invite_code
        and q.reserved_amount_wei is not null
    );

  v_post_base_promotion :=
    public.read_reward_x_promotion_post_base_liability_wei(
      v_network,
      v_app_id
    );

  if v_post_base_promotion<0 then
    raise exception 'REWARD_X_PROMOTION_NEGATIVE_POST_BASE_LIABILITY';
  end if;

  -- A future admission HELD liability is actual physical encumbrance.
  -- Include it in ALL existing base/X signer and reserve readers exactly once.
  select coalesce(sum(h.amount_wei),0) into v_early_held
  from reward_admission_bridge.holds h
  where h.network=v_network and h.app_id=v_app_id and h.status='HELD';
  if v_early_held<0 then raise exception 'ADMISSION_HOLD_CORRUPT'; end if;

  -- Before the first partially settled winner, ring-fence ALL uncommitted
  -- cohort funds, including prospective X options and unfinished claimants.
  -- This is deliberately more restrictive than the current payout estimate.
  v_elastic_contingent :=
    public.read_reward_elastic_contingent_liability_wei_v1(v_network,v_app_id);
  return (
    v_elastic_contingent +
    v_early_held +
    v_reserved_existing +
    v_legacy_reserved +
    v_post_base_promotion
  )::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_recovery_balance_wei(p_network text, p_recipient_wallet text)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with consumed as (
    select
      a.obligation_id,
      coalesce(sum(a.amount_wei),0)::numeric as consumed_wei
    from public.reward_recovery_allocations a
    group by a.obligation_id
  )
  select coalesce(sum(
    greatest(o.amount_wei-coalesce(c.consumed_wei,0),0)
  ),0)::numeric
  from public.reward_recovery_obligations o
  left join consumed c on c.obligation_id=o.id
  where o.network=lower(btrim(p_network))
    and o.recipient_wallet=lower(btrim(p_recipient_wallet))
    and o.status='ACTIVE';
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_external_runtime_readiness_v1(p_network text, p_max_age_seconds integer DEFAULT 1200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_max_age integer := greatest(60,least(coalesce(p_max_age_seconds,1200),86400));
  v_row public.reward_x_promotion_external_runtime_checks%rowtype;
  v_ready boolean := false;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;

  select * into v_row
  from public.reward_x_promotion_external_runtime_checks c
  where c.network=v_network
  order by c.checked_at desc,c.id desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ready',false,
      'network',v_network,
      'maxAgeSeconds',v_max_age,
      'status','NO_CHECK',
      'checkedAt',null
    );
  end if;

  v_ready :=
    v_row.status in ('READY','POST_NOT_FOUND')
    and v_row.checked_at >= now()-make_interval(secs=>v_max_age);

  return jsonb_build_object(
    'ready',v_ready,
    'network',v_network,
    'maxAgeSeconds',v_max_age,
    'status',v_row.status,
    'checkedAt',v_row.checked_at,
    'probePostId',v_row.probe_post_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reward_x_promotion_policy_for_invitation_v3(p_invite_code text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_created_at timestamptz; v_cutover timestamptz; v_sunset timestamptz;
begin
 select i.created_at,c.reward_x_promotion_v3_cutover_at,c.reward_x_promotion_v3_sunset_at into v_created_at,v_cutover,v_sunset
 from public.invitations i cross join public.reward_runtime_config c
 where i.invite_code=upper(btrim(coalesce(p_invite_code,''))) and c.id=1;
 if not found then raise exception 'REWARD_X_INVITATION_OR_CONFIG_MISSING'; end if;
 if v_cutover is not null and v_created_at>=v_cutover and (v_sunset is null or v_created_at<v_sunset) then return 'x-promotion-withheld-10pct-v3'; end if;
 return 'x-promotion-additive-v2';
end $function$;

CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_post_base_liability_wei(p_network text, p_app_id text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_network text := lower(btrim(p_network));
  v_app_id text := lower(btrim(p_app_id));
  v_amount numeric(78,0) := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;
  if v_app_id<>v_veinvite_app_id then
    raise exception 'REWARD_X_PROMOTION_APP_MISMATCH';
  end if;

  select coalesce(sum(o.promotion_amount_wei),0)
  into v_amount
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s
    on s.id=o.split_id
   and s.mode='LIVE'
  where o.network=v_network
    and o.financial_state in ('RESERVED','HELD')
   and (s.policy_version='x-promotion-additive-v2' or
       (s.policy_version='x-promotion-withheld-10pct-v3' and exists
         (select 1 from public.reward_payouts paid
          where paid.invite_code=o.invite_code and paid.status='PAID')));

  return v_amount;
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_elastic_contingent_scope_liability_wei_v1(p_network text, p_app_id text, p_target_cohort bigint, p_target_receipt bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_cfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_cohort record;
 v_unbound bigint;
 v_budget numeric(78,0);
 v_active_committed numeric(78,0);
 v_finalized_paid_not_in_queue numeric(78,0);
 v_unspent numeric(78,0);
 v_total numeric(78,0):=0;
BEGIN
 p_network:=lower(btrim(coalesce(p_network,'')));
 p_app_id:=lower(btrim(coalesce(p_app_id,'')));
 IF p_network NOT IN ('mainnet','testnet','testnet-staging') OR p_app_id<>v_app
 THEN RAISE EXCEPTION 'ELASTIC_CONTINGENT_INVALID_SCOPE'; END IF;
 IF (p_target_cohort IS NULL) <> (p_target_receipt IS NULL) THEN
   RAISE EXCEPTION 'ELASTIC_CONTINGENT_TARGET_INCOMPLETE';
 END IF;
 -- A completion-time, shared physical-pool promise no longer ring-fences
 -- future unfinished participants or cohort-based hypothetical budgets.
 -- Existing fixed base, X and early HELD remain in the canonical reader.
 IF EXISTS (SELECT 1 FROM reward_admission_bridge.shared_pool_settings s
            WHERE s.id=1 AND s.enabled)
 THEN RETURN 0; END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR NOT v_cfg.enabled OR NOT v_cfg.allow_protected_partial_settlement
 THEN RETURN 0; END IF;
 IF v_cfg.rollout_not_before IS NULL THEN RAISE EXCEPTION 'ELASTIC_CONTINGENT_NO_EPOCH'; END IF;
 -- Unbound accepted invitations cannot safely reserve a cohort yet. Fail
 -- CLOSED: even unrelated rewards must not spend unknown new liabilities.
 SELECT count(*) INTO v_unbound FROM public.invitations i
 WHERE i.activation_network=p_network AND i.activated_at>=v_cfg.rollout_not_before
   AND i.status<>'CANCELLED' AND i.sybil_status<>'BLOCKED'
   AND (i.reward_cohort_round_id IS NULL
        OR i.reward_funding_allocation_receipt_id IS NULL);
 IF v_unbound>0 THEN RAISE EXCEPTION 'ELASTIC_CONTINGENT_UNBOUND_INVITATIONS'; END IF;
 FOR v_cohort IN
   SELECT DISTINCT i.reward_cohort_round_id AS round_id,
     i.reward_funding_allocation_receipt_id AS receipt_id
   FROM public.invitations i
   WHERE i.activation_network=p_network
     AND i.activated_at>=v_cfg.rollout_not_before
     AND i.status<>'CANCELLED' AND i.sybil_status<>'BLOCKED'
     AND (p_target_cohort IS NULL OR
       (i.reward_cohort_round_id=p_target_cohort
        AND i.reward_funding_allocation_receipt_id=p_target_receipt))
 LOOP
   v_budget:=public.read_reward_cohort_effective_budget_wei(
     p_network,v_app,v_cohort.round_id,v_cohort.receipt_id);
   v_active_committed:=public.read_reward_cohort_committed_wei(
     p_network,v_app,v_cohort.round_id,v_cohort.receipt_id);
   -- A PAID payout without an active queue no longer occupies a pending
   -- on-chain liability but DID consume this cohort's historical budget.
   SELECT coalesce(sum(p.amount_wei),0) INTO v_finalized_paid_not_in_queue
   FROM public.reward_payouts p
   JOIN public.invitations i ON i.invite_code=p.invite_code
   JOIN public.reward_rounds r ON r.id=p.round_id
   WHERE r.network=p_network AND r.app_id=v_app AND p.status='PAID'
     AND i.reward_cohort_round_id=v_cohort.round_id
     AND i.reward_funding_allocation_receipt_id=v_cohort.receipt_id
     AND NOT EXISTS (
       SELECT 1 FROM public.reward_queue_entries q
       WHERE q.invite_code=p.invite_code
         AND q.network=p_network
         AND q.reserved_amount_wei IS NOT NULL
         AND q.status IN ('AWAITING_CLAIM','QUEUED','ASSIGNED'));
   IF v_budget<0 OR v_active_committed<0 OR v_finalized_paid_not_in_queue<0
      OR v_budget<v_active_committed+v_finalized_paid_not_in_queue
   THEN RAISE EXCEPTION 'ELASTIC_CONTINGENT_BUDGET_INCONSISTENT'; END IF;
   -- Release ONLY once the source-sweep interlock independently confirms
   -- no pending invite, unpaid base Claim, 72h X opportunity or LIVE X
   -- verification remains. A confirmed BLOCKED Sybil is terminal.
   IF public.reward_elastic_source_has_unsettled_slots_v1(
     p_network,v_app,v_cohort.round_id,v_cohort.receipt_id
   ) THEN
     v_unspent:=v_budget-v_active_committed-v_finalized_paid_not_in_queue;
   ELSE
     v_unspent:=0;
   END IF;
   v_total:=v_total+v_unspent;
 END LOOP;
 IF v_total<0 OR v_total<>trunc(v_total) THEN
   RAISE EXCEPTION 'ELASTIC_CONTINGENT_ACCOUNTING_INVALID';
 END IF;
 RETURN v_total;
END $function$;

CREATE OR REPLACE FUNCTION public.read_reward_cohort_effective_budget_wei(p_network text, p_app_id text, p_reward_cohort_round_id bigint, p_allocation_receipt_id bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_receipt public.vebetter_round_allocations%rowtype;
  v_adjustment numeric(78,0) := 0;
  v_net_flow numeric(78,0) := 0;
  v_budget numeric(78,0) := 0;
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id = p_allocation_receipt_id
    and a.network = p_network
    and a.app_id = p_app_id;

  if not found
     or v_receipt.vebetter_round_id + 1 <> p_reward_cohort_round_id then
    raise exception 'allocation receipt does not fund the requested reward cohort';
  end if;

  select coalesce(sum(a.amount_wei),0)
  into v_adjustment
  from public.reward_cohort_funding_adjustments a
  where a.network = p_network
    and a.app_id = p_app_id
    and a.reward_cohort_round_id = p_reward_cohort_round_id
    and a.allocation_receipt_id = p_allocation_receipt_id;

  v_net_flow := public.read_reward_boost_reserve_cohort_net_flow_wei(
    p_network,
    p_app_id,
    p_reward_cohort_round_id,
    p_allocation_receipt_id
  );

  v_budget :=
    v_receipt.rewards_allocation_amount_wei +
    v_adjustment +
    v_net_flow;

  if v_budget < 0 then
    raise exception 'REWARD_COHORT_EFFECTIVE_BUDGET_NEGATIVE';
  end if;

  return v_budget;
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_boost_reserve_cohort_net_flow_wei(p_network text, p_app_id text, p_reward_cohort_round_id bigint, p_allocation_receipt_id bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_receipt public.vebetter_round_allocations%rowtype;
  v_inflow numeric(78,0) := 0;
  v_outflow numeric(78,0) := 0;
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id = p_allocation_receipt_id
    and a.network = p_network
    and a.app_id = p_app_id;

  if not found
     or v_receipt.vebetter_round_id + 1 <> p_reward_cohort_round_id then
    raise exception 'allocation receipt does not fund the requested reward cohort';
  end if;

  select coalesce(sum(l.amount_wei),0)
  into v_inflow
  from public.reward_boost_reserve_ledger l
  where l.network = p_network
    and l.app_id = p_app_id
    and l.destination_reward_cohort_round_id = p_reward_cohort_round_id
    and l.destination_allocation_receipt_id = p_allocation_receipt_id
    and l.entry_kind in ('BOOST_RELEASE','LATE_COMPLETION_RELEASE');

  select coalesce(sum(l.amount_wei),0)
  into v_outflow
  from public.reward_boost_reserve_ledger l
  where l.network = p_network
    and l.app_id = p_app_id
    and l.source_reward_cohort_round_id = p_reward_cohort_round_id
    and l.source_allocation_receipt_id = p_allocation_receipt_id
    and l.entry_kind = 'SOURCE_SWEEP';

  return v_inflow - v_outflow;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reward_elastic_source_has_unsettled_slots_v1(p_network text, p_app_id text, p_reward_cohort_round_id bigint, p_receipt_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_enabled boolean;
 v_rollout timestamptz;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging')
   OR lower(btrim(coalesce(p_app_id,'')))<>v_app OR p_receipt_id IS NULL
   OR p_reward_cohort_round_id IS NULL
 THEN RAISE EXCEPTION 'ELASTIC_SOURCE_GUARD_SCOPE_INVALID'; END IF;
 SELECT e.enabled AND e.allow_protected_partial_settlement,e.rollout_not_before
 INTO v_enabled,v_rollout
 FROM reward_admission_bridge.elastic_settlement_settings e WHERE e.id=1;
 IF NOT coalesce(v_enabled,false) THEN RETURN false; END IF;
 IF v_rollout IS NULL THEN RAISE EXCEPTION 'ELASTIC_SOURCE_GUARD_EPOCH_MISSING'; END IF;
 RETURN EXISTS (
  SELECT 1 FROM public.invitations i
  WHERE i.activation_network=p_network
    AND i.reward_cohort_round_id=p_reward_cohort_round_id
    AND i.reward_funding_allocation_receipt_id=p_receipt_id
    AND i.activated_at>=v_rollout AND i.status<>'CANCELLED' AND i.sybil_status<>'BLOCKED'
    AND NOT EXISTS(SELECT 1 FROM public.reward_queue_entries q
      WHERE q.invite_code=i.invite_code)
    AND NOT EXISTS(SELECT 1 FROM public.reward_payouts p
      WHERE p.invite_code=i.invite_code)
    AND NOT EXISTS(SELECT 1 FROM public.reward_recovery_settlements r
      WHERE r.invite_code=i.invite_code)
 ) OR EXISTS (
   -- A fixed-but-unpaid base Claim also has a prospective X opportunity;
   -- never sweep the spare 10 B3TR while Claim is in progress.
   SELECT 1 FROM public.invitations i
   JOIN public.reward_queue_entries q ON q.invite_code=i.invite_code
   WHERE i.activation_network=p_network
     AND i.reward_cohort_round_id=p_reward_cohort_round_id
     AND i.reward_funding_allocation_receipt_id=p_receipt_id
     AND i.activated_at>=v_rollout
     AND i.status<>'CANCELLED'
     AND q.network=p_network
     AND q.status IN ('AWAITING_CLAIM','QUEUED','ASSIGNED')
     AND NOT EXISTS (
       SELECT 1 FROM public.reward_payouts paid
       WHERE paid.invite_code=q.invite_code AND paid.status='PAID')
 ) OR EXISTS (
   SELECT 1
   FROM public.invitations i
   JOIN public.reward_payouts p ON p.invite_code=i.invite_code
   JOIN public.reward_rounds rr ON rr.id=p.round_id
   WHERE i.activation_network=p_network
     AND i.reward_cohort_round_id=p_reward_cohort_round_id
     AND i.reward_funding_allocation_receipt_id=p_receipt_id
     AND i.activated_at>=v_rollout
     AND i.status<>'CANCELLED'
     AND rr.network=p_network AND rr.app_id=v_app
     AND p.status='PAID'
     AND (p.paid_at IS NULL
          OR p.paid_at>clock_timestamp()-interval '72 hours')
 ) OR EXISTS (
   SELECT 1
   FROM public.reward_x_promotion_obligations x
   JOIN public.invitations i ON i.invite_code=x.invite_code
   WHERE x.network=p_network
     AND x.source_reward_cohort_round_id=p_reward_cohort_round_id
     AND x.source_allocation_receipt_id=p_receipt_id
     AND i.activation_network=p_network
     AND i.activated_at>=v_rollout
     AND x.financial_state IN ('RESERVED','HELD')
 ) OR EXISTS (
   SELECT 1
   FROM public.reward_x_promotion_post_submissions x
   JOIN public.invitations i ON i.invite_code=x.invite_code
   WHERE x.network=p_network
     AND i.activation_network=p_network
     AND i.reward_cohort_round_id=p_reward_cohort_round_id
     AND i.reward_funding_allocation_receipt_id=p_receipt_id
     AND i.activated_at>=v_rollout
     AND x.invalidated_at IS NULL
     AND x.submission_state NOT IN ('REJECTED','INVALIDATED','CANCELLED')
 );
END $function$;

CREATE OR REPLACE FUNCTION public.record_reward_x_promotion_split_exemption_v1(p_queue_entry_id bigint, p_invite_code text, p_reason text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_queue public.reward_queue_entries%rowtype;
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_reason text := upper(btrim(coalesce(p_reason,'')));
  v_details jsonb := coalesce(p_details,'{}'::jsonb);
begin
  if p_queue_entry_id is null or p_queue_entry_id<=0 then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_QUEUE_REQUIRED';
  end if;

  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  if v_reason not in (
    'FEATURE_DISABLED_AFTER_LIVE_START',
    'LIVE_START_MISSING',
    'POLICY_UNSUPPORTED',
    'DEPENDENCY_GATE_NOT_READY',
    'EXTERNAL_READY_START_MISSING',
    'BEFORE_EXTERNAL_READY_START',
    'EXTERNAL_RUNTIME_NOT_READY',
    'ACTIVE_REFERRAL_LINK_MISSING',
    'PROMOTION_BUDGET_UNAVAILABLE',
    'SPLIT_CREATION_FAILED'
  ) then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_REASON_INVALID';
  end if;

  if jsonb_typeof(v_details)<>'object' then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_DETAILS_INVALID';
  end if;

  select * into v_queue
  from public.reward_queue_entries q
  where q.id=p_queue_entry_id
    and q.invite_code=v_code;

  if not found
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei<=0
     or v_queue.reserved_at is null
     or v_queue.recipient_wallet is null
     or v_queue.network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_QUEUE_MISMATCH';
  end if;

  if exists (
    select 1
    from public.reward_x_promotion_splits s
    where s.queue_entry_id=v_queue.id
       or s.invite_code=v_queue.invite_code
  ) then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_SPLIT_EXISTS';
  end if;

  insert into public.reward_x_promotion_split_exemptions(
    queue_entry_id,
    invite_code,
    network,
    recipient_wallet,
    reservation_amount_wei,
    exemption_reason,
    policy_version,
    details
  ) values (
    v_queue.id,
    v_queue.invite_code,
    v_queue.network,
    lower(v_queue.recipient_wallet),
    v_queue.reserved_amount_wei,
    v_reason,
    'x-promotion-additive-v2',
    v_details
  )
  on conflict (queue_entry_id) do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_reward_x_promotion_obligation_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_split public.reward_x_promotion_splits%rowtype;
begin
  if new.financial_state<>'RESERVED'
     or new.held_at is not null
     or new.released_at is not null
     or new.paid_at is not null
     or new.release_reason is not null then
    raise exception 'REWARD_X_PROMOTION_OBLIGATION_INITIAL_STATE_INVALID';
  end if;

  select * into v_split
  from public.reward_x_promotion_splits s
  where s.id=new.split_id;

  if not found
     or v_split.mode<>'LIVE'
     or v_split.promotion_amount_wei<=0
     or v_split.invite_code<>new.invite_code
     or v_split.network<>new.network
     or v_split.recipient_wallet<>new.recipient_wallet
     or v_split.promotion_amount_wei<>new.promotion_amount_wei
     or v_split.source_reward_cohort_round_id<>new.source_reward_cohort_round_id
     or v_split.source_allocation_receipt_id<>new.source_allocation_receipt_id
     or btrim(v_split.policy_version)<>btrim(new.policy_version) then
    raise exception 'REWARD_X_PROMOTION_OBLIGATION_SPLIT_MISMATCH';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_reward_x_promotion_obligation_from_split()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.mode='LIVE' and new.promotion_amount_wei>0 then
    insert into public.reward_x_promotion_obligations(
      split_id,invite_code,network,recipient_wallet,promotion_amount_wei,
      source_reward_cohort_round_id,source_allocation_receipt_id,
      policy_version,financial_state
    ) values (
      new.id,new.invite_code,new.network,new.recipient_wallet,new.promotion_amount_wei,
      new.source_reward_cohort_round_id,new.source_allocation_receipt_id,
      new.policy_version,'RESERVED'
    );
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reject_reward_x_promotion_split_when_exempt_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if exists (
    select 1
    from public.reward_x_promotion_split_exemptions e
    where e.queue_entry_id=new.queue_entry_id
       or e.invite_code=new.invite_code
  ) then
    raise exception 'REWARD_X_PROMOTION_SPLIT_EXEMPT';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_vote_round_close_single_reservation_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE cfg reward_admission_bridge.vote_round_close_settings%rowtype;
        wcfg reward_admission_bridge.vote_window_immediate_settings%rowtype;
        q reward_admission_bridge.vote_window_fixed_quotes%rowtype;
        vote_round bigint;
        source_round bigint;
BEGIN
 SELECT * INTO cfg FROM reward_admission_bridge.vote_round_close_settings WHERE id=1;
 IF NOT FOUND OR NOT cfg.enabled THEN RETURN NEW; END IF;
 SELECT i.vote_round_id,i.reward_cohort_round_id
   INTO vote_round,source_round
 FROM public.invitations i WHERE i.invite_code=NEW.invite_code
   AND i.activation_network=NEW.network;
 IF vote_round IS NULL OR vote_round<cfg.first_vote_round_id THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.reserved_amount_wei IS NOT NULL
    AND NEW.reserved_amount_wei IS NOT DISTINCT FROM OLD.reserved_amount_wei
    AND NEW.reservation_algorithm_version IS NOT DISTINCT FROM OLD.reservation_algorithm_version
    AND NEW.reservation_basis IS NOT DISTINCT FROM OLD.reservation_basis
 THEN RETURN NEW; END IF;
 IF cfg.paused THEN RAISE EXCEPTION 'VOTE_ROUND_CLOSE_NEW_RESERVATIONS_PAUSED'; END IF;
 IF coalesce(NEW.reservation_basis->>'quoteKind','')='vote_window_immediate_v1' THEN
    SELECT * INTO wcfg FROM reward_admission_bridge.vote_window_immediate_settings WHERE id=1;
    SELECT * INTO q FROM reward_admission_bridge.vote_window_fixed_quotes x
      WHERE x.network=NEW.network AND x.vote_round_id=vote_round;
    IF q.vote_round_id IS NULL OR wcfg.id IS NULL OR NOT wcfg.enabled
       OR vote_round NOT BETWEEN wcfg.first_vote_round_id AND wcfg.last_vote_round_id
       OR source_round IS DISTINCT FROM q.source_cohort_round_id
       OR NEW.reservation_algorithm_version IS DISTINCT FROM 'shared-pool-v1'
       OR NEW.reserved_amount_wei IS DISTINCT FROM q.quote_wei
       OR coalesce(NEW.reservation_basis->>'voteRoundId','')<>vote_round::text
       OR coalesce(NEW.reservation_basis->>'participantCount','')<>q.participant_count::text
    THEN RAISE EXCEPTION 'VOTE_WINDOW_UNVERIFIED_IMMEDIATE_QUOTE'; END IF;
    RETURN NEW;
 END IF;
 IF NEW.reserved_amount_wei IS NULL OR NEW.reserved_amount_wei<=0
    OR NEW.reservation_algorithm_version IS DISTINCT FROM 'shared-pool-v1'
    OR coalesce(NEW.reservation_basis->>'roundClosePolicy','')<>'vote-round-close-equal-v1'
    OR coalesce(NEW.reservation_basis->>'quoteKind','')<>'vote_round_close_equal_v1'
    OR coalesce(NEW.reservation_basis->>'voteRoundId','')<>vote_round::text
    OR coalesce(NEW.reservation_basis->>'batchVerifiedCount','') !~ '^[1-9][0-9]*$'
 THEN RAISE EXCEPTION 'VOTE_ROUND_CLOSE_LEGACY_NEW_RESERVATION_BLOCKED'; END IF;
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_reward_queue_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_inviter_wallet text;
  v_invitee_wallet text;
  v_activation_network text;
  v_activation_block bigint;
  v_reward_status text;
  v_check_invite_code text;
  v_check_wallet text;
  v_check_network text;
  v_check_block bigint;
  v_check_outcome text;
  v_check_entry_class text;
begin
  select
    inviter_wallet,
    invitee_wallet,
    activation_network,
    activation_block,
    reward_status
  into
    v_inviter_wallet,
    v_invitee_wallet,
    v_activation_network,
    v_activation_block,
    v_reward_status
  from public.invitations
  where invite_code = new.invite_code;

  if not found then
    raise exception 'Reward queue invitation % does not exist', new.invite_code;
  end if;

  if lower(v_inviter_wallet) <> lower(new.recipient_wallet) then
    raise exception 'Reward queue recipient does not match inviter for %', new.invite_code;
  end if;

  if v_activation_network is null
     or new.network <> v_activation_network then
    raise exception 'Reward queue network does not match invitation %', new.invite_code;
  end if;

  select
    invite_code,
    wallet_address,
    network,
    checked_block,
    outcome,
    entry_class
  into
    v_check_invite_code,
    v_check_wallet,
    v_check_network,
    v_check_block,
    v_check_outcome,
    v_check_entry_class
  from public.eligibility_check_events
  where id = new.eligibility_check_id;

  if not found then
    raise exception 'Reward queue eligibility check % does not exist', new.eligibility_check_id;
  end if;

  if v_check_invite_code <> new.invite_code
     or v_invitee_wallet is null
     or lower(v_check_wallet) <> lower(v_invitee_wallet)
     or v_check_network <> new.network
     or v_activation_block is null
     or v_check_block > v_activation_block
     or v_check_outcome <> 'ELIGIBLE'
     or v_check_entry_class not in ('NEW', 'RETURNING')
     or v_check_entry_class <> new.entry_class then
    raise exception 'Reward queue eligibility proof does not match invitation %', new.invite_code;
  end if;

  if new.status in ('AWAITING_CLAIM', 'QUEUED')
     and v_reward_status <> 'ELIGIBLE' then
    raise exception 'Only reward-eligible invitations can await or enter the queue: %', new.invite_code;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_sybil_v2_reward_queue_clearance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.sybil_clearance_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.sybil_v2_reward_clearances c
    where c.id = new.sybil_clearance_id
      and c.invite_code = new.invite_code
      and c.network = new.network
      and c.verdict in ('CLEAR','WATCH')
  ) then
    raise exception 'REWARD_QUEUE_SYBIL_V2_CLEARANCE_INVALID';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_reward_queue_identity_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_identity_link_status text;
  v_identity_link_checked_at timestamptz;
  v_vote_completed_at timestamptz;
  v_identity_link_policy_version text;
  v_identity_link_evidence jsonb;
begin
  if new.status not in ('AWAITING_CLAIM','QUEUED','ASSIGNED') then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_sybil_v2_' || new.invite_code, 0)
  );

  if new.sybil_clearance_id is not null then
    if exists (
      select 1
      from public.sybil_v2_reward_clearances c
      join public.sybil_v2_referral_assessments a
        on a.invite_code = c.invite_code
       and a.network = c.network
       and a.revision = c.assessment_revision
       and a.state = c.verdict
      where c.id = new.sybil_clearance_id
        and c.invite_code = new.invite_code
        and c.network = new.network
        and c.verdict in ('CLEAR','WATCH')
    ) then
      return new;
    end if;

    raise exception 'REWARD_QUEUE_SYBIL_V2_CURRENT_ASSESSMENT_REQUIRED';
  end if;

  select
    i.identity_link_status,
    i.identity_link_checked_at,
    i.vote_completed_at,
    i.identity_link_policy_version,
    i.identity_link_evidence
  into
    v_identity_link_status,
    v_identity_link_checked_at,
    v_vote_completed_at,
    v_identity_link_policy_version,
    v_identity_link_evidence
  from public.invitations i
  where i.invite_code = new.invite_code;

  if not found
     or not public.security_identity_reward_gate_passes(
       v_identity_link_status,
       v_identity_link_checked_at,
       v_vote_completed_at,
       v_identity_link_policy_version,
       v_identity_link_evidence
     ) then
    raise exception 'REWARD_QUEUE_IDENTITY_GATE_NOT_SATISFIED';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_sybil_v2_clear_only_queue_authority()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.status not in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
     or new.sybil_clearance_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.sybil_v2_reward_clearances c
    join public.sybil_v2_referral_assessments a
      on a.invite_code = c.invite_code
     and a.network = c.network
     and a.revision = c.assessment_revision
     and a.state = 'CLEAR'
    where c.id = new.sybil_clearance_id
      and c.invite_code = new.invite_code
      and c.network = new.network
      and c.verdict = 'CLEAR'
  ) then
    raise exception 'REWARD_QUEUE_SYBIL_V2_CLEAR_ONLY_REQUIRED';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.release_invitation_slot_after_reward_reservation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.reserved_amount_wei is not null
     and new.reserved_at is not null
     and (
       tg_op = 'INSERT'
       or old.reserved_amount_wei is null
       or old.reserved_at is null
     ) then
    update public.invitations i
    set slot_released_at = coalesce(i.slot_released_at, new.reserved_at)
    where i.invite_code = new.invite_code
      and i.status = 'COMPLETED';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_reward_queue_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.status = 'ASSIGNED' then
    if new.status is distinct from old.status or new.assigned_round_id is distinct from old.assigned_round_id or new.assigned_at is distinct from old.assigned_at or new.invite_code is distinct from old.invite_code or new.recipient_wallet is distinct from old.recipient_wallet or new.eligibility_check_id is distinct from old.eligibility_check_id or new.entry_class is distinct from old.entry_class or new.network is distinct from old.network or new.eligible_at is distinct from old.eligible_at or new.queued_at is distinct from old.queued_at or new.cancelled_at is distinct from old.cancelled_at or new.cancel_reason is distinct from old.cancel_reason or new.claim_requested_at is distinct from old.claim_requested_at or new.claim_requested_by_wallet is distinct from old.claim_requested_by_wallet then
      raise exception 'assigned reward queue entry % is immutable', old.invite_code;
    end if;
    return new;
  end if;
  if old.claim_requested_at is not null and (new.claim_requested_at is distinct from old.claim_requested_at or new.claim_requested_by_wallet is distinct from old.claim_requested_by_wallet)
     and not (old.status = 'CANCELLED' and new.status = 'AWAITING_CLAIM' and new.claim_requested_at is null and new.claim_requested_by_wallet is null) then
    raise exception 'reward queue evidence for % is immutable', old.invite_code;
  end if;
  if old.status = 'AWAITING_CLAIM' then
    if new.status not in ('AWAITING_CLAIM', 'QUEUED', 'CANCELLED') then raise exception 'invalid awaiting-queue transition for %', old.invite_code; end if;
    if new.status = 'QUEUED' and (new.claim_requested_at is null or new.claim_requested_by_wallet is null or new.claim_requested_by_wallet <> old.recipient_wallet) then
      raise exception 'claim evidence is required before queueing %', old.invite_code;
    end if;
  end if;
  if old.status = 'QUEUED' and new.status not in ('QUEUED', 'ASSIGNED', 'CANCELLED') then raise exception 'invalid reward queue transition for %', old.invite_code; end if;
  if old.status = 'CANCELLED' and new.status not in ('CANCELLED', 'AWAITING_CLAIM', 'QUEUED') then raise exception 'cancelled reward queue entry % can only return after fresh eligibility', old.invite_code; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_reward_claim(p_invite_code text, p_recipient_wallet text)
 RETURNS TABLE(invite_code text, status text, claim_requested_at timestamp with time zone, claim_requested_by_wallet text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_wallet text := lower(btrim(p_recipient_wallet));
  v_queue public.reward_queue_entries%rowtype;
  v_invitation public.invitations%rowtype;
  v_clearance public.sybil_v2_reward_clearances%rowtype;
begin
  if v_code is null or v_code='' then raise exception 'INVITE_CODE_REQUIRED'; end if;
  if v_wallet is null or v_wallet !~ '^0x[0-9a-f]{40}$' then raise exception 'INVALID_RECIPIENT_WALLET'; end if;

  perform pg_advisory_xact_lock(hashtextextended('veinvite_reward_claim_' || v_code,0));
  perform pg_advisory_xact_lock(hashtextextended('veinvite_sybil_v2_' || v_code,0));

  select * into v_queue
  from public.reward_queue_entries q
  where q.invite_code = v_code
  for update;

  if not found
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei <= 0
     or v_queue.reserved_at is null then
    raise exception 'REWARD_CLAIM_NOT_AVAILABLE';
  end if;

  if v_queue.recipient_wallet <> v_wallet then
    raise exception 'REWARD_CLAIM_WALLET_MISMATCH';
  end if;

  if v_queue.status = 'CANCELLED' then
    raise exception 'REWARD_CLAIM_CANCELLED';
  end if;

  if v_queue.sybil_clearance_id is not null then
    select c.* into v_clearance
    from public.sybil_v2_reward_clearances c
    join public.sybil_v2_referral_assessments a
      on a.invite_code = c.invite_code
     and a.network = c.network
     and a.revision = c.assessment_revision
     and a.state = c.verdict
    where c.id = v_queue.sybil_clearance_id
      and c.invite_code = v_queue.invite_code
      and c.network = v_queue.network
      and c.verdict in ('CLEAR','WATCH');

    if not found then
      raise exception 'REWARD_CLAIM_NOT_AVAILABLE';
    end if;
  else
    select * into v_invitation
    from public.invitations i
    where i.invite_code = v_code
    for update;

    if not found
       or v_invitation.status <> 'COMPLETED'
       or v_invitation.reward_status not in ('ELIGIBLE','PAID')
       or v_invitation.reward_eligible_at is null
       or v_invitation.sybil_status <> 'CLEAR'
       or v_invitation.sybil_checked_at is null
       or lower(v_invitation.inviter_wallet) <> v_wallet
       or v_queue.eligible_at <> v_invitation.reward_eligible_at then
      raise exception 'REWARD_CLAIM_NOT_AVAILABLE';
    end if;
  end if;

  if v_queue.status = 'AWAITING_CLAIM' then
    update public.reward_queue_entries q
    set
      status = 'QUEUED',
      queued_at = coalesce(q.queued_at,now()),
      claim_requested_at = now(),
      claim_requested_by_wallet = v_wallet
    where q.id = v_queue.id
    returning q.* into v_queue;
  elsif v_queue.status not in ('QUEUED','ASSIGNED') then
    raise exception 'REWARD_CLAIM_NOT_AVAILABLE';
  end if;

  if v_queue.claim_requested_at is null
     or v_queue.claim_requested_by_wallet <> v_wallet then
    raise exception 'REWARD_CLAIM_STATE_INVALID';
  end if;

  return query
  select
    v_queue.invite_code,
    v_queue.status,
    v_queue.claim_requested_at,
    v_queue.claim_requested_by_wallet;
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_batch_transfer_amount_wei_v1(p_invite_code text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_cfg public.reward_runtime_config%rowtype;
  v_queue public.reward_queue_entries%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_exemption public.reward_x_promotion_split_exemptions%rowtype;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  select * into v_queue
  from public.reward_queue_entries q
  where q.invite_code=v_code;

  if not found
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei<=0
     or v_queue.reserved_at is null then
    raise exception 'REWARD_BATCH_RESERVATION_MISSING';
  end if;

  -- Existing LIVE promises remain authoritative regardless of later runtime
  -- changes.
  select * into v_split
  from public.reward_x_promotion_splits s
  where s.invite_code=v_code
    and s.mode='LIVE';

  if found then
    if v_split.queue_entry_id<>v_queue.id
       or v_split.network<>v_queue.network
       or v_split.recipient_wallet<>lower(v_queue.recipient_wallet)
       or v_split.reservation_amount_wei<>v_queue.reserved_amount_wei
       or v_split.policy_version<>public.reward_x_promotion_policy_for_invitation_v3(v_code)
       or v_split.base_amount_wei<=0
       or not (
          (v_split.policy_version='x-promotion-additive-v2' and v_split.base_amount_wei=v_queue.reserved_amount_wei)
          or (v_split.policy_version='x-promotion-withheld-10pct-v3' and
              v_split.base_amount_wei+v_split.promotion_amount_wei=v_queue.reserved_amount_wei
              and v_split.promotion_rate_bps=1000)
       ) then
      raise exception 'REWARD_X_PROMOTION_LIVE_SPLIT_MISMATCH';
    end if;

    if v_split.promotion_amount_wei>0 then
      select * into v_obligation
      from public.reward_x_promotion_obligations o
      where o.split_id=v_split.id
        and o.invite_code=v_code;

      if not found
         or v_obligation.network<>v_split.network
         or v_obligation.recipient_wallet<>v_split.recipient_wallet
         or v_obligation.promotion_amount_wei<>v_split.promotion_amount_wei
         or v_obligation.policy_version<>v_split.policy_version
         or v_obligation.financial_state<>'RESERVED' then
        raise exception 'REWARD_X_PROMOTION_OBLIGATION_NOT_RESERVED';
      end if;
    end if;

    return v_split.base_amount_wei;
  end if;

  if public.reward_x_promotion_policy_for_invitation_v3(v_code)='x-promotion-withheld-10pct-v3' then
     raise exception 'REWARD_X_V3_LIVE_SPLIT_MISSING';
  end if;
  -- A durable exemption records that this exact reservation intentionally
  -- stayed on the legacy full-payout path. Runtime changes after reservation
  -- cannot retroactively turn it into a missing-split failure.
  select * into v_exemption
  from public.reward_x_promotion_split_exemptions e
  where e.queue_entry_id=v_queue.id
    and e.invite_code=v_code;

  if found then
    if v_exemption.network<>v_queue.network
       or v_exemption.recipient_wallet<>lower(v_queue.recipient_wallet)
       or v_exemption.reservation_amount_wei<>v_queue.reserved_amount_wei
       or v_exemption.policy_version<>'x-promotion-additive-v2' then
      raise exception 'REWARD_X_PROMOTION_SPLIT_EXEMPTION_MISMATCH';
    end if;

    return v_queue.reserved_amount_wei;
  end if;

  if not v_cfg.reward_x_promotion_enabled then
    return v_queue.reserved_amount_wei;
  end if;

  if v_cfg.reward_x_promotion_live_started_at is null then
    raise exception 'REWARD_X_PROMOTION_LIVE_START_MISSING';
  end if;

  if v_queue.reserved_at<v_cfg.reward_x_promotion_live_started_at then
    return v_queue.reserved_amount_wei;
  end if;

  -- Preserve pre-exemption grandfathering for reservations created while the
  -- external verification gate was unavailable.
  if not v_cfg.reward_x_promotion_external_verification_ready then
    return v_queue.reserved_amount_wei;
  end if;

  if v_cfg.reward_x_promotion_external_verification_started_at is null then
    raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_START_MISSING';
  end if;

  if v_queue.reserved_at<v_cfg.reward_x_promotion_external_verification_started_at then
    return v_queue.reserved_amount_wei;
  end if;

  raise exception 'REWARD_X_PROMOTION_LIVE_SPLIT_MISSING';
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_reward_payout_x_promotion_amount_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_queue public.reward_queue_entries%rowtype;
  v_expected numeric(78,0);
begin
  select * into v_queue
  from public.reward_queue_entries q
  where q.invite_code=new.invite_code;

  -- Preserve truly legacy/manual payouts that have no fixed reservation row.
  if not found or v_queue.reserved_amount_wei is null then
    return new;
  end if;

  if lower(new.recipient_wallet)<>lower(v_queue.recipient_wallet) then
    raise exception 'REWARD_PAYOUT_RECIPIENT_QUEUE_MISMATCH';
  end if;

  v_expected :=
    public.read_reward_batch_transfer_amount_wei_v1(new.invite_code);

  if new.amount_wei<>v_expected then
    raise exception 'REWARD_PAYOUT_X_PROMOTION_AMOUNT_MISMATCH';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_mainnet_reward_payout_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_network text;
  v_enabled boolean := false;
begin
  select rr.network
  into v_network
  from public.reward_rounds rr
  where rr.id = new.round_id;

  if not found then
    raise exception 'Reward payout references a missing reward round';
  end if;

  if v_network <> 'mainnet' then
    return new;
  end if;

  select c.mainnet_funded_rewards_enabled
  into v_enabled
  from public.reward_runtime_config c
  where c.id = 1;

  if coalesce(v_enabled, false) = false then
    raise exception 'Mainnet funded rewards are disabled by the VeInvite runtime safety gate';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_reward_receipt_from_paid_payout()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_round public.reward_rounds%rowtype;
  v_epoch public.reward_budget_epochs%rowtype;
  v_settlement public.reward_payout_transaction_settlements%rowtype;
  v_existing public.reward_receipts%rowtype;
  v_vebetter_round_id bigint;
begin
  if new.status <> 'PAID'
     or old.status = 'PAID' then
    return new;
  end if;

  if new.tx_id is null or new.paid_at is null then
    raise exception 'PAID payout is missing transaction evidence';
  end if;

  if not exists (
    select 1
    from public.invitations i
    where i.invite_code = new.invite_code
      and i.inviter_wallet = new.recipient_wallet
  ) then
    raise exception 'reward receipt recipient must be the invitation inviter';
  end if;

  select * into v_round
  from public.reward_rounds
  where id = new.round_id;

  if not found then
    raise exception 'reward receipt reward round was not found';
  end if;

  if v_round.reward_budget_epoch_id is not null then
    select * into v_epoch
    from public.reward_budget_epochs e
    where e.id = v_round.reward_budget_epoch_id;

    if not found then
      raise exception 'reward receipt predictive budget epoch was not found';
    end if;

    if v_epoch.network <> v_round.network
       or v_epoch.app_id <> v_round.app_id then
      raise exception 'reward receipt predictive budget epoch does not match reward round';
    end if;

    v_vebetter_round_id := v_epoch.vebetter_round_id;
  elsif v_round.vebetter_round_id is not null
        and v_round.allocation_receipt_id is not null
        and v_round.allocation_rewards_wei is not null
        and v_round.opening_carryover_wei is not null then
    v_vebetter_round_id := v_round.vebetter_round_id;
  else
    raise exception 'reward receipt requires an allocation or predictive-budget bound reward round';
  end if;

  select * into v_settlement
  from public.reward_payout_transaction_settlements s
  where s.round_id = new.round_id
    and s.tx_id = new.tx_id;

  if not found then
    raise exception 'reward receipt requires a finalized payout settlement';
  end if;

  if v_settlement.network <> v_round.network
     or v_settlement.paid_at <> new.paid_at
     or v_settlement.finalized_head_number < v_settlement.block_number then
    raise exception 'reward receipt settlement evidence does not match the paid payout';
  end if;

  insert into public.reward_receipts(
    payout_id, round_id, settlement_id, network, vebetter_round_id,
    invite_code, recipient_wallet, amount_wei, tx_id, paid_at
  ) values (
    new.id, new.round_id, v_settlement.id, v_round.network,
    v_vebetter_round_id, new.invite_code, new.recipient_wallet,
    new.amount_wei, new.tx_id, new.paid_at
  )
  on conflict (payout_id) do nothing;

  if not found then
    select * into v_existing
    from public.reward_receipts
    where payout_id = new.id;

    if not found
       or v_existing.round_id <> new.round_id
       or v_existing.settlement_id <> v_settlement.id
       or v_existing.network <> v_round.network
       or v_existing.vebetter_round_id <> v_vebetter_round_id
       or v_existing.invite_code <> new.invite_code
       or v_existing.recipient_wallet <> new.recipient_wallet
       or v_existing.amount_wei <> new.amount_wei
       or v_existing.tx_id <> new.tx_id
       or v_existing.paid_at <> new.paid_at then
      raise exception 'existing reward receipt does not match immutable payout evidence';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_paid_payout_to_invitation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status='PAID' then
    update public.invitations
      set reward_status='PAID', reward_paid_at=new.paid_at
    where invite_code=new.invite_code;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.security_identity_reward_gate_passes(p_status text, p_checked_at timestamp with time zone, p_vote_completed_at timestamp with time zone, p_policy_version text, p_evidence jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select
    public.security_identity_assessment_supported(
      p_status,
      p_policy_version,
      p_evidence
    )
    and p_checked_at is not null
    and p_vote_completed_at is not null
    and p_checked_at >= p_vote_completed_at;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_invitation_identity_reward_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_v2_enforced boolean := public.sybil_v2_enforcement_enabled();
  v_has_v2_clearance boolean := false;
begin
  if v_v2_enforced and new.invite_code is not null then
    select exists (
      select 1
      from public.reward_queue_entries q
      join public.sybil_v2_reward_clearances c
        on c.id = q.sybil_clearance_id
       and c.invite_code = q.invite_code
      where q.invite_code = new.invite_code
        and q.sybil_clearance_id is not null
    )
    into v_has_v2_clearance;
  end if;

  if new.reward_status = 'ELIGIBLE' then
    if v_v2_enforced then
      if not public.security_identity_v2_observation_complete(
        new.identity_link_status,
        new.identity_link_checked_at,
        new.vote_completed_at,
        new.identity_link_policy_version,
        new.identity_link_evidence
      ) then
        new.reward_status := 'PENDING';
        new.reward_eligible_at := null;
      end if;
    elsif not public.security_identity_reward_gate_passes(
      new.identity_link_status,
      new.identity_link_checked_at,
      new.vote_completed_at,
      new.identity_link_policy_version,
      new.identity_link_evidence
    ) then
      new.reward_status := 'PENDING';
      new.reward_eligible_at := null;
    end if;
  elsif new.reward_status = 'PAID' then
    if tg_op = 'INSERT' then
      if not (
        v_has_v2_clearance
        or public.security_identity_reward_gate_passes(
          new.identity_link_status,
          new.identity_link_checked_at,
          new.vote_completed_at,
          new.identity_link_policy_version,
          new.identity_link_evidence
        )
      ) then
        raise exception 'PAID_REWARD_IDENTITY_GATE_NOT_SATISFIED';
      end if;
    elsif old.reward_status is distinct from 'PAID'
          and not (
            v_has_v2_clearance
            or public.security_identity_reward_gate_passes(
              new.identity_link_status,
              new.identity_link_checked_at,
              new.vote_completed_at,
              new.identity_link_policy_version,
              new.identity_link_evidence
            )
          ) then
      raise exception 'PAID_REWARD_IDENTITY_GATE_NOT_SATISFIED';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.freeze_v2_claim_ready_invitation_authority()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if old.reward_status = 'ELIGIBLE'
     and exists (
       select 1
       from public.reward_queue_entries q
       where q.invite_code = old.invite_code
         and q.sybil_clearance_id is not null
         and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
     )
  then
    new.status := old.status;
    new.reward_eligible_at := old.reward_eligible_at;

    new.sybil_status := old.sybil_status;
    new.sybil_risk_level := old.sybil_risk_level;
    new.sybil_risk_score := old.sybil_risk_score;
    new.sybil_reason := old.sybil_reason;
    new.sybil_checked_at := old.sybil_checked_at;
    new.sybil_source := old.sybil_source;

    if new.reward_status <> 'PAID' then
      new.reward_status := old.reward_status;
      new.reward_paid_at := old.reward_paid_at;
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_reward_queue_from_invitation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_should_cancel boolean := false;
begin
  if tg_op='UPDATE' and old.reward_status='ELIGIBLE' and new.reward_status <> 'ELIGIBLE' then v_should_cancel := true; end if;
  if v_should_cancel then
    update public.reward_queue_entries
    set status='CANCELLED', cancelled_at=now(), cancel_reason=case
      when new.status='CANCELLED' then 'invitation_cancelled'
      when new.sybil_status='BLOCKED' then 'sybil_blocked'
      when new.reward_status='FORFEITED' then 'reward_forfeited'
      else 'eligibility_revoked' end
    where invite_code=new.invite_code and status in ('AWAITING_CLAIM','QUEUED');
  end if;

  if tg_op='UPDATE' and old.reward_status is distinct from 'ELIGIBLE' and new.reward_status='ELIGIBLE'
     and new.status='COMPLETED' and new.sybil_status='CLEAR' and new.reward_eligible_at is not null then
    begin
      update public.reward_queue_entries q
      set status=case when q.claim_requested_at is not null and q.claim_requested_by_wallet=q.recipient_wallet then 'QUEUED' else 'AWAITING_CLAIM' end,
          eligible_at=new.reward_eligible_at,
          queued_at=case when q.claim_requested_at is not null and q.claim_requested_by_wallet=q.recipient_wallet then coalesce(q.queued_at, now()) else null end,
          claim_requested_at=case when q.claim_requested_at is not null and q.claim_requested_by_wallet=q.recipient_wallet then q.claim_requested_at else null end,
          claim_requested_by_wallet=case when q.claim_requested_at is not null and q.claim_requested_by_wallet=q.recipient_wallet then q.claim_requested_by_wallet else null end,
          cancelled_at=null,cancel_reason=null
      where q.invite_code=new.invite_code and q.status='CANCELLED' and q.cancel_reason in ('sybil_blocked','eligibility_revoked')
        and q.reserved_amount_wei is not null and q.reserved_amount_wei > 0 and q.reserved_at is not null
        and not exists(select 1 from public.reward_payouts rp where rp.invite_code=q.invite_code);
    exception when others then
      if sqlerrm = 'REWARD_COHORT_BUDGET_EXCEEDED' then null; else raise; end if;
    end;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.read_reward_elastic_contingent_liability_wei_v1(p_network text, p_app_id text)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT public.read_reward_elastic_contingent_scope_liability_wei_v1(
   p_network,p_app_id,NULL::bigint,NULL::bigint);
$function$;

CREATE OR REPLACE FUNCTION public.is_sybil_v2_referral_invalidated(p_invite_code text, p_network text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select case
    when p_invite_code is null then false
    else
      exists (
        select 1
        from public.sybil_v2_referral_invalidations x
        where x.invite_code = upper(btrim(p_invite_code))
          and x.status = 'ACTIVE'
          and (
            p_network is null
            or x.network = lower(btrim(p_network))
          )
      )
      or exists (
        select 1
        from public.invitations i
        join public.sybil_v2_referral_assessments a
          on a.invite_code = i.invite_code
        join public.sybil_v2_wallet_restrictions r
          on r.network = a.network
         and r.wallet_address = lower(i.invitee_wallet)
         and r.related_invite_code = i.invite_code
         and r.status = 'ACTIVE'
         and r.resolved_at is null
        where i.invite_code = upper(btrim(p_invite_code))
          and a.state = 'RESTRICTED'
          and i.reward_status <> 'PAID'
          and not exists (
            select 1
            from public.reward_queue_entries q
            where q.invite_code = i.invite_code
              and q.status = 'ASSIGNED'
          )
          and (
            p_network is null
            or a.network = lower(btrim(p_network))
          )
      )
      or exists (
        select 1
        from public.invitations i
        where i.invite_code = upper(btrim(p_invite_code))
          and i.sybil_status = 'BLOCKED'
          and i.status = 'CANCELLED'
          and i.reward_status = 'FORFEITED'
          and (
            p_network is null
            or lower(coalesce(i.activation_network,'')) = lower(btrim(p_network))
          )
      )
  end;
$function$;
-- Exercise actual production financial guards and exact X-split authority.
CREATE TRIGGER reward_queue_cohort_budget_guard BEFORE INSERT OR UPDATE OF reserved_amount_wei,status ON public.reward_queue_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_reward_queue_cohort_budget();
CREATE TRIGGER reward_queue_entries_validate BEFORE INSERT OR UPDATE ON public.reward_queue_entries FOR EACH ROW EXECUTE FUNCTION public.validate_reward_queue_entry();
CREATE TRIGGER reward_queue_entries_transition_guard BEFORE UPDATE ON public.reward_queue_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_reward_queue_transition();
CREATE TRIGGER reward_queue_guard_vote_round_close_single_writer BEFORE INSERT OR UPDATE OF reserved_amount_wei,reservation_algorithm_version,reservation_basis,status ON public.reward_queue_entries FOR EACH ROW EXECUTE FUNCTION public.guard_vote_round_close_single_reservation_v1();
CREATE TRIGGER zy_reward_queue_sybil_v2_clearance_gate BEFORE INSERT OR UPDATE OF sybil_clearance_id,invite_code,network,status ON public.reward_queue_entries FOR EACH ROW EXECUTE FUNCTION public.validate_sybil_v2_reward_queue_clearance();
CREATE TRIGGER zz_reward_queue_identity_gate BEFORE INSERT OR UPDATE ON public.reward_queue_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_reward_queue_identity_gate();
CREATE TRIGGER zzzz_reward_queue_sybil_v2_clear_only BEFORE INSERT OR UPDATE OF status,sybil_clearance_id ON public.reward_queue_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_sybil_v2_clear_only_queue_authority();
CREATE TRIGGER reward_queue_create_x_promotion_live_split AFTER INSERT ON public.reward_queue_entries FOR EACH ROW EXECUTE FUNCTION public.create_reward_x_promotion_live_split_from_queue();
CREATE TRIGGER reward_queue_release_slot_after_reservation AFTER INSERT OR UPDATE OF reserved_amount_wei,reserved_at ON public.reward_queue_entries FOR EACH ROW EXECUTE FUNCTION public.release_invitation_slot_after_reward_reservation();
CREATE TRIGGER validate_reward_x_promotion_split_trigger BEFORE INSERT ON public.reward_x_promotion_splits FOR EACH ROW EXECUTE FUNCTION public.validate_reward_x_promotion_split();
CREATE TRIGGER guard_reward_x_promotion_split_exemption_trigger BEFORE INSERT ON public.reward_x_promotion_splits FOR EACH ROW EXECUTE FUNCTION public.reject_reward_x_promotion_split_when_exempt_v1();
CREATE TRIGGER create_reward_x_promotion_obligation_from_split_trigger AFTER INSERT ON public.reward_x_promotion_splits FOR EACH ROW EXECUTE FUNCTION public.create_reward_x_promotion_obligation_from_split();
CREATE TRIGGER validate_reward_x_promotion_obligation_insert_trigger BEFORE INSERT ON public.reward_x_promotion_obligations FOR EACH ROW EXECUTE FUNCTION public.validate_reward_x_promotion_obligation_insert();
CREATE TRIGGER reward_payouts_mainnet_funded_gate BEFORE INSERT ON public.reward_payouts FOR EACH ROW EXECUTE FUNCTION public.enforce_mainnet_reward_payout_gate();
CREATE TRIGGER validate_reward_payout_x_promotion_amount_v1_trigger BEFORE INSERT ON public.reward_payouts FOR EACH ROW EXECUTE FUNCTION public.validate_reward_payout_x_promotion_amount_v1();
CREATE TRIGGER reward_payouts_create_receipt AFTER UPDATE OF status ON public.reward_payouts FOR EACH ROW WHEN(new.status='PAID' AND old.status IS DISTINCT FROM 'PAID') EXECUTE FUNCTION public.create_reward_receipt_from_paid_payout();
CREATE TRIGGER reward_payouts_sync_invitation_paid AFTER UPDATE OF status ON public.reward_payouts FOR EACH ROW WHEN(new.status='PAID') EXECUTE FUNCTION public.sync_paid_payout_to_invitation();
CREATE TRIGGER invitations_sync_reward_queue AFTER UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.sync_reward_queue_from_invitation();
CREATE TRIGGER zy_invitations_identity_reward_gate BEFORE UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.enforce_invitation_identity_reward_gate();
CREATE TRIGGER zzzz_invitations_freeze_v2_claim_authority BEFORE UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.freeze_v2_claim_ready_invitation_authority();
