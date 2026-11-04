-- Staged completion-time HELD -> existing Claim/X reward queue handoff.
-- This migration does NOT authorize new HELD reservations or turn on admission.
-- Production settings CHECK(enabled=false) and policy version are unchanged.
-- Only service_role may call the service gateway. No RPC for anon/authenticated.
BEGIN;

CREATE OR REPLACE FUNCTION public.read_reward_admission_hold_for_reservation_v1(
  p_invite_code text,
  p_network text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $hold_reader$
DECLARE
  v_code text:=upper(btrim(coalesce(p_invite_code,'')));
  v_network text:=lower(btrim(coalesce(p_network,'')));
  v_hold reward_admission_bridge.holds%rowtype;
  v_enabled boolean;
BEGIN
  IF v_code !~ '^[A-Z0-9-]{6,48}$'
    OR v_network NOT IN ('mainnet','testnet','testnet-staging')
  THEN
    RAISE EXCEPTION 'INVALID_ADMISSION_HOLD_LOOKUP';
  END IF;

  SELECT enabled INTO v_enabled
  FROM reward_admission_bridge.settings WHERE id=1;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMISSION_SETTINGS_MISSING'; END IF;

  SELECT * INTO v_hold
  FROM reward_admission_bridge.holds
  WHERE invite_code=v_code AND network=v_network;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status','NONE','admissionEnabled',v_enabled);
  END IF;

  IF v_hold.app_id <>
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
  THEN RAISE EXCEPTION 'ADMISSION_WRONG_APP'; END IF;
  RETURN jsonb_build_object(
    'status',v_hold.status,
    'admissionEnabled',v_enabled,
    'guaranteedWei',v_hold.amount_wei::text,
    'cohortRoundId',v_hold.reward_cohort_round_id::text,
    'allocationReceiptId',v_hold.funding_allocation_receipt_id::text);
END $hold_reader$;

REVOKE ALL ON FUNCTION public.read_reward_admission_hold_for_reservation_v1(text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_reward_admission_hold_for_reservation_v1(text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.commit_reward_admission_held_to_fixed_v1(
  p_invite_code text,
  p_network text,
  p_observed_pool_balance_wei numeric,
  p_expected_reserved_before_wei numeric,
  p_amount_wei numeric,
  p_algorithm_version text,
  p_quote_snapshot_id bigint,
  p_finalized_block bigint,
  p_basis jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $service_handoff$
DECLARE
  v_enabled boolean;
BEGIN
  -- The private handoff performs the canonical financial locks, Sybil,
  -- queue and recovery settlement checks, and exact gross/net reconciliation.
  -- NEVER try to replace it with direct queue writes in the public surface.
  SELECT enabled INTO v_enabled
  FROM reward_admission_bridge.settings WHERE id=1;
  IF NOT FOUND OR v_enabled IS DISTINCT FROM true THEN
    RETURN jsonb_build_object(
      'reserved',false,'reason','ADMISSION_HANDOFF_DISABLED');
  END IF;

  RETURN reward_admission_bridge.commit_held_to_fixed_v1(
    p_invite_code,p_network,p_observed_pool_balance_wei,
    p_expected_reserved_before_wei,p_amount_wei,
    p_algorithm_version,p_quote_snapshot_id,p_finalized_block,p_basis);
END $service_handoff$;

REVOKE ALL ON FUNCTION public.commit_reward_admission_held_to_fixed_v1(
  text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_reward_admission_held_to_fixed_v1(
  text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb
) TO service_role;


-- Independent DB interlock: legacy queue/recovery writers can never create
-- a SECOND obligation while an invite has an active HELD minimum. The
-- transaction-local atomic handoff first marks HELD -> CONVERTED, then invokes
-- the legacy writer; this is the only valid transition.
CREATE OR REPLACE FUNCTION reward_admission_bridge.reject_legacy_double_commit_with_held_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM reward_admission_bridge.holds h
    WHERE h.network=lower(btrim(new.network))
      AND h.invite_code=upper(btrim(new.invite_code))
      AND h.status='HELD'
  ) THEN
    RAISE EXCEPTION 'LEGACY_REWARD_WRITER_BLOCKED_BY_HELD_GUARANTEE';
  END IF;
  RETURN new;
END $guard$;

REVOKE ALL ON FUNCTION reward_admission_bridge.reject_legacy_double_commit_with_held_v1()
FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS aa_reward_queue_reject_held_double_commit
  ON public.reward_queue_entries;
CREATE TRIGGER aa_reward_queue_reject_held_double_commit
BEFORE INSERT OR UPDATE OF invite_code,network ON public.reward_queue_entries
FOR EACH ROW
EXECUTE FUNCTION reward_admission_bridge.reject_legacy_double_commit_with_held_v1();

DROP TRIGGER IF EXISTS aa_reward_recovery_reject_held_double_commit
  ON public.reward_recovery_settlements;
CREATE TRIGGER aa_reward_recovery_reject_held_double_commit
BEFORE INSERT OR UPDATE OF invite_code,network ON public.reward_recovery_settlements
FOR EACH ROW
EXECUTE FUNCTION reward_admission_bridge.reject_legacy_double_commit_with_held_v1();

COMMIT;
