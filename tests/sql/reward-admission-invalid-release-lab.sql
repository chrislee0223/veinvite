-- Disposable PostgreSQL 17 ONLY. This is NOT a Production migration.
-- Release is strictly for already blocked/cancelled unconverted invitations.
-- No refund, payout, token transfer, or new admission authority.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION reward_admission_bridge.lab_release_invalid_hold_v1(
  p_invite_code text, p_network text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $fn$
DECLARE
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_net text := lower(btrim(coalesce(p_network,'')));
  v_enabled boolean;
  v_inv public.invitations%rowtype;
  v_hold reward_admission_bridge.holds%rowtype;
  v_app constant text := '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_before numeric(78,0);
  v_before_cohort numeric(78,0);
  v_after numeric(78,0);
  v_after_cohort numeric(78,0);
BEGIN
  IF v_code !~ '^[A-Z0-9-]{6,48}$'
     OR v_net NOT IN ('mainnet','testnet','testnet-staging') THEN
    RAISE EXCEPTION 'INVALID_HOLD_RELEASE_INPUT';
  END IF;
  SELECT enabled INTO v_enabled FROM reward_admission_bridge.settings WHERE id=1;
  IF NOT FOUND OR v_enabled IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('released',false,'reason','ADMISSION_RELEASE_DISABLED');
  END IF;
  -- Must use the same lock hierarchy as admission/Claim reservation.
  PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
  PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||v_net,0));

  SELECT * INTO v_inv FROM public.invitations
  WHERE invite_code=v_code AND activation_network=v_net FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('released',false,'reason','INVITE_NOT_FOUND'); END IF;
  SELECT * INTO v_hold FROM reward_admission_bridge.holds
  WHERE invite_code=v_code AND network=v_net FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('released',false,'reason','HOLD_NOT_FOUND'); END IF;
  IF v_hold.status<>'HELD' THEN
    RETURN jsonb_build_object('released',false,'reason','HOLD_ALREADY_FINAL');
  END IF;
  IF v_hold.app_id<>v_app
     OR v_inv.reward_cohort_round_id IS DISTINCT FROM v_hold.reward_cohort_round_id
     OR v_inv.reward_funding_allocation_receipt_id IS DISTINCT FROM v_hold.funding_allocation_receipt_id
  THEN RETURN jsonb_build_object('released',false,'reason','FUNDING_IDENTITY_MISMATCH'); END IF;
  IF v_inv.status<>'CANCELLED' AND v_inv.sybil_status<>'BLOCKED' THEN
    RETURN jsonb_build_object('released',false,'reason','INVITATION_NOT_FINAL_INVALID');
  END IF;
  -- Fail closed rather than releasing an amount that already became a
  -- fixed reward, payout, or applied recovery.
  IF EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=v_code)
     OR EXISTS(SELECT 1 FROM public.reward_recovery_settlements s WHERE s.invite_code=v_code)
     OR EXISTS(SELECT 1 FROM public.reward_payouts p WHERE p.invite_code=v_code)
  THEN RETURN jsonb_build_object('released',false,'reason','FIXED_REWARD_EXISTS'); END IF;
  v_before:=public.read_outstanding_reward_liability(v_net,v_app)::numeric;
  v_before_cohort:=public.read_reward_cohort_committed_wei(
    v_net,v_app,v_hold.reward_cohort_round_id,v_hold.funding_allocation_receipt_id);
  UPDATE reward_admission_bridge.holds SET status='RELEASED'
    WHERE invite_code=v_code AND network=v_net AND status='HELD';
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMISSION_RELEASE_LOST_RACE'; END IF;
  v_after:=public.read_outstanding_reward_liability(v_net,v_app)::numeric;
  v_after_cohort:=public.read_reward_cohort_committed_wei(
    v_net,v_app,v_hold.reward_cohort_round_id,v_hold.funding_allocation_receipt_id);
  IF v_before-v_after<>v_hold.amount_wei
     OR v_before_cohort-v_after_cohort<>v_hold.amount_wei
  THEN RAISE EXCEPTION 'ADMISSION_RELEASE_ACCOUNTING_MISMATCH'; END IF;
  RETURN jsonb_build_object('released',true,'reason','INVALID_HOLD_RELEASED',
    'releasedWei',v_hold.amount_wei::text);
END $fn$;
REVOKE ALL ON FUNCTION reward_admission_bridge.lab_release_invalid_hold_v1(text,text)
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
