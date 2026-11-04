-- Phase 12: strengthen the already-disabled HELD -> fixed handoff with exact
-- canonical GROSS/OFFSET/NET ACTIVE settlement proof and return-kind checks.
-- The installed Phase 11 function is replaced in-place, still uncallable.
-- This function can NEVER execute a transition on deployed settings:
-- reward_admission_bridge.settings.enabled has CHECK(enabled=false).
-- No direct service/public execute privilege is granted. It is not called
-- by any live cron, quote, Claim, payout or X path.
-- Only promote with a separately audited admission writer, wallet collateral
-- policy and permission migration after all finality and Sybil QA completes.
BEGIN;

CREATE OR REPLACE FUNCTION reward_admission_bridge.commit_held_to_fixed_v1(
  p_invite_code text,
  p_network text,
  p_observed_pool_balance_wei numeric,
  p_expected_reserved_before_wei numeric,
  p_amount_wei numeric,
  p_algorithm_version text,
  p_quote_snapshot_id bigint,
  p_finalized_block bigint,
  p_basis jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, reward_admission_bridge
AS $handoff$
DECLARE
  v_code text:=upper(btrim(coalesce(p_invite_code,'')));
  v_network text:=lower(btrim(coalesce(p_network,'')));
  v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_enabled boolean;
  v_hold reward_admission_bridge.holds%rowtype;
  v_invitation public.invitations%rowtype;
  v_before_physical numeric(78,0);
  v_before_cohort numeric(78,0);
  v_after_physical numeric(78,0);
  v_after_cohort numeric(78,0);
  v_net numeric(78,0);
  v_result jsonb;
  v_failure jsonb;
  v_message text;
  v_basis jsonb;
BEGIN
  IF v_network NOT IN ('mainnet','testnet','testnet-staging')
     OR v_code='' OR p_amount_wei IS NULL OR p_amount_wei<=0
     OR p_amount_wei<>trunc(p_amount_wei)
     OR p_observed_pool_balance_wei IS NULL
     OR p_observed_pool_balance_wei<0
     OR p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei)
     OR p_expected_reserved_before_wei IS NULL
     OR p_expected_reserved_before_wei<0
     OR p_expected_reserved_before_wei<>trunc(p_expected_reserved_before_wei)
     OR p_basis IS NULL OR jsonb_typeof(p_basis)<>'object'
     OR coalesce(p_basis->>'cohortReservedWei','') !~ '^(0|[1-9][0-9]*)$'
  THEN RAISE EXCEPTION 'ADMISSION_HANDOFF_INPUT_INVALID'; END IF;

  -- DB policy is hard-disabled by settings_enabled_check, not an API flag.
  SELECT enabled INTO v_enabled FROM reward_admission_bridge.settings WHERE id=1;
  IF NOT FOUND OR v_enabled IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('reserved',false,'reason','ADMISSION_HANDOFF_DISABLED');
  END IF;

  -- Match both existing live lock orders: emergency pause, network-wide
  -- canonical reservations, followed by invite/hold. No naked lock release.
  PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
  PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||v_network,0));

  SELECT * INTO v_invitation FROM public.invitations i
  WHERE i.invite_code=v_code AND i.activation_network=v_network FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('reserved',false,'reason','INVITE_NOT_FOUND'); END IF;

  SELECT * INTO v_hold FROM reward_admission_bridge.holds h
  WHERE h.network=v_network AND h.invite_code=v_code FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('reserved',false,'reason','NO_ADMISSION_HOLD');
  END IF;
  IF v_hold.status<>'HELD' THEN
    RETURN jsonb_build_object('reserved',false,'reason','HOLD_ALREADY_CONSUMED');
  END IF;
  IF v_hold.app_id<>v_app
     OR v_invitation.reward_cohort_round_id IS DISTINCT FROM v_hold.reward_cohort_round_id
     OR v_invitation.reward_funding_allocation_receipt_id
        IS DISTINCT FROM v_hold.funding_allocation_receipt_id
  THEN RETURN jsonb_build_object('reserved',false,'reason','FUNDING_RECEIPT_MISMATCH'); END IF;

  IF p_amount_wei<v_hold.amount_wei THEN
    RETURN jsonb_build_object('reserved',false,'reason','GROSS_BELOW_HELD_MINIMUM');
  END IF;

  -- Never let an existing queue/PAID/recovery record consume a still-HELD
  -- row a second time. Prior accounting drift is a terminal fail-closed gate.
  IF EXISTS(SELECT 1 FROM public.reward_queue_entries q
            WHERE q.invite_code=v_code)
     OR EXISTS(SELECT 1 FROM public.reward_recovery_settlements s
               WHERE s.network=v_network AND s.invite_code=v_code)
  THEN RETURN jsonb_build_object('reserved',false,'reason','ALREADY_FIXED_HOLD_DRIFT'); END IF;

  -- These live functions already include HELD and LIVE X exactly once.
  v_before_physical:=public.read_outstanding_reward_liability(v_network,v_app)::numeric;
  v_before_cohort:=public.read_reward_cohort_committed_wei(
    v_network,v_app,v_hold.reward_cohort_round_id,
    v_hold.funding_allocation_receipt_id);
  IF v_before_physical<v_hold.amount_wei OR v_before_cohort<v_hold.amount_wei
  THEN RAISE EXCEPTION 'ADMISSION_HELD_ACCOUNTING_DRIFT'; END IF;
  IF v_before_physical<>p_expected_reserved_before_wei
     OR v_before_cohort<>(p_basis->>'cohortReservedWei')::numeric
  THEN
    RETURN jsonb_build_object(
      'reserved',false,'reason','RECALCULATE',
      'reservedExistingWei',v_before_physical::text,
      'cohortCommittedWei',v_before_cohort::text);
  END IF;

  -- Inner subtransaction guarantees that a rejected / erroring legacy
  -- reservation can NEVER release the original HELD minimum.
  BEGIN
    UPDATE reward_admission_bridge.holds SET status='CONVERTED'
    WHERE network=v_network AND invite_code=v_code AND status='HELD';

    -- Replace only the two exact expected accounting values: this invite's
    -- old HELD is now absent, and the canonical legacy writer will create
    -- exactly one immutable queue or recovery obligation.
    v_basis:=jsonb_set(p_basis,'{cohortReservedWei}',
                      to_jsonb((v_before_cohort-v_hold.amount_wei)::text),true);
    v_result:=public.commit_reward_reservation_with_late_reserve(
      v_code,v_network,p_observed_pool_balance_wei,
      v_before_physical-v_hold.amount_wei,p_amount_wei,
      p_algorithm_version,p_quote_snapshot_id,p_finalized_block,v_basis
    );

    IF v_result IS NULL OR jsonb_typeof(v_result)<>'object'
       OR v_result->>'reserved' IS DISTINCT FROM 'true'
    THEN
      v_failure:=coalesce(v_result,jsonb_build_object('reserved',false,'reason','LEGACY_RESULT_MALFORMED'));
      RAISE EXCEPTION 'ADMISSION_HANDOFF_ROLLBACK';
    END IF;

    IF coalesce(v_result->>'reason','') NOT IN
       ('RESERVED','RECOVERY_PARTIAL_RESERVED','RECOVERY_FULLY_SETTLED')
    THEN
      RAISE EXCEPTION 'ADMISSION_HANDOFF_NONNEW_SETTLEMENT';
    END IF;
    IF coalesce(v_result->>'amountWei','') !~ '^(0|[1-9][0-9]*)$'
    THEN RAISE EXCEPTION 'ADMISSION_HANDOFF_NET_AMOUNT_INVALID'; END IF;
    v_net:=(v_result->>'amountWei')::numeric;
    IF v_net>p_amount_wei THEN RAISE EXCEPTION 'ADMISSION_HANDOFF_NET_EXCEEDS_GROSS'; END IF;

    -- A mock/incorrect core result is not sufficient proof that a debit
    -- was actually booked. Demand the canonical ACTIVE recovery settlement
    -- for this exact invite, network, GROSS, offset and NET before reducing
    -- the original HELD commitment. Core verification is still required.
    IF v_net<p_amount_wei THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.reward_recovery_settlements s
        WHERE s.invite_code=v_code AND s.network=v_network
          AND s.state='ACTIVE'
          AND s.gross_amount_wei=p_amount_wei
          AND s.net_amount_wei=v_net
          AND s.offset_amount_wei=p_amount_wei-v_net
      ) THEN RAISE EXCEPTION 'ADMISSION_HANDOFF_RECOVERY_PROOF_INVALID'; END IF;
      IF (v_net=0 AND v_result->>'reason'<>'RECOVERY_FULLY_SETTLED')
        OR (v_net>0 AND v_result->>'reason'<>'RECOVERY_PARTIAL_RESERVED')
      THEN RAISE EXCEPTION 'ADMISSION_HANDOFF_RECOVERY_KIND_MISMATCH'; END IF;
    ELSE
      IF v_result->>'reason'<>'RESERVED' OR EXISTS (
        SELECT 1 FROM public.reward_recovery_settlements s
        WHERE s.invite_code=v_code AND s.network=v_network
      ) THEN RAISE EXCEPTION 'ADMISSION_HANDOFF_UNEXPECTED_RECOVERY'; END IF;
    END IF;
    IF v_net>0 AND NOT EXISTS(
      SELECT 1 FROM public.reward_queue_entries q
      WHERE q.invite_code=v_code
        AND q.network=v_network
        AND q.reserved_amount_wei=v_net
        AND q.status IN ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    ) THEN RAISE EXCEPTION 'ADMISSION_HANDOFF_QUEUE_MISSING'; END IF;
    IF v_net=0 AND NOT EXISTS(
      SELECT 1 FROM public.reward_recovery_settlements s
      WHERE s.network=v_network AND s.invite_code=v_code
        AND s.net_amount_wei=0 AND s.gross_amount_wei=p_amount_wei
    ) THEN RAISE EXCEPTION 'ADMISSION_HANDOFF_FULL_OFFSET_MISSING'; END IF;

    v_after_physical:=public.read_outstanding_reward_liability(v_network,v_app)::numeric;
    v_after_cohort:=public.read_reward_cohort_committed_wei(
      v_network,v_app,v_hold.reward_cohort_round_id,
      v_hold.funding_allocation_receipt_id);

    -- Physical ledger changes by NET minus HELD; cohort spends GROSS
    -- minus HELD. Existing LIVE X liability and legacy PAID remain intact.
    IF v_after_physical<>v_before_physical-v_hold.amount_wei+v_net
       OR v_after_cohort<>v_before_cohort-v_hold.amount_wei+p_amount_wei
    THEN RAISE EXCEPTION 'ADMISSION_HANDOFF_GROSS_NET_DRIFT'; END IF;
    IF v_after_cohort>public.read_reward_cohort_effective_budget_wei(
       v_network,v_app,v_hold.reward_cohort_round_id,
       v_hold.funding_allocation_receipt_id)
    THEN RAISE EXCEPTION 'ADMISSION_HANDOFF_COHORT_UNDERFUNDED'; END IF;

    RETURN v_result || jsonb_build_object(
      'admissionHandoff',true,'guaranteedMinimumWei',v_hold.amount_wei::text,
      'grossCommittedWei',p_amount_wei::text,
      'netPayableWei',v_net::text);
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message='ADMISSION_HANDOFF_ROLLBACK' THEN
      RETURN v_failure;
    END IF;
    RAISE;
  END;
END $handoff$;

-- The private function can only be run by the migration/DB owner.
-- SQL settings CHECK(enabled=false) makes its mutation path unreachable.
REVOKE ALL ON FUNCTION reward_admission_bridge.commit_held_to_fixed_v1(
 text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
