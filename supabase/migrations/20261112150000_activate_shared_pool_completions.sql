-- Activate the previously staged common B3TR physical pool settlement.
-- Approved policy: only verified completed referrals are priced; no advance
-- reservation for unfinished past/current participants; preserve fixed Claims,
-- X 10 B3TR, anti-Sybil and immutable historical payout records.
-- Production code verified READY at 040b311b5c121b05450fe57b3a45dc5699720962.
DO $activate$
DECLARE
  v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_mode jsonb;
  v_shadow_before jsonb;
  v_shadow_after jsonb;
  v_preview jsonb;
  v_audit jsonb;
  v_pending_payouts bigint;
  v_completed_ready bigint;
  v_funded_holds bigint;
  v_changed integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
  PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_mainnet',0));

  v_mode:=public.read_reward_shared_pool_mode_v1('mainnet');
  IF v_mode->>'enabled'<>'false' THEN
    RAISE EXCEPTION 'SHARED_POOL_ALREADY_ENABLED_OR_MISSING';
  END IF;
  IF (SELECT emergency_rewards_paused
      FROM public.reward_runtime_config WHERE id=1)
     OR NOT (SELECT mainnet_funded_rewards_enabled
             FROM public.reward_runtime_config WHERE id=1) THEN
    RAISE EXCEPTION 'SHARED_POOL_RUNTIME_CLOSED';
  END IF;
  SELECT count(*) INTO v_pending_payouts FROM public.reward_payouts
   WHERE status IN ('PENDING','SENDING','FAILED');
  SELECT count(*) INTO v_completed_ready
   FROM public.read_reward_reservation_candidates_v2('mainnet',100);
  SELECT count(*) INTO v_funded_holds FROM reward_admission_bridge.holds
   WHERE network='mainnet' AND status='HELD';
  IF v_pending_payouts<>0 OR v_completed_ready<>0 OR v_funded_holds<>0 THEN
    RAISE EXCEPTION 'SHARED_POOL_ACTIVE_FINANCIAL_CHANGE_REQUIRES_REVIEW:%,%,%',
      v_pending_payouts,v_completed_ready,v_funded_holds;
  END IF;

  v_audit:=public.read_reward_boost_reserve_audit_snapshot('mainnet',v_app);
  IF v_audit->>'conservationOk'<>'true'
    OR v_audit->>'stressReserveCovered'<>'true'
    OR (v_audit->>'sourceOverrunCount')::integer<>0
    OR (v_audit->>'destinationOverrunCount')::integer<>0 THEN
      RAISE EXCEPTION 'SHARED_POOL_LEGACY_LEDGER_INCONSISTENT';
  END IF;

  IF EXISTS(SELECT 1 FROM reward_admission_bridge.shared_pool_settings
      WHERE id<>1 OR policy_version<>'shared-pool-v1') THEN
    RAISE EXCEPTION 'SHARED_POOL_SETTINGS_INVALID';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.elastic_settlement_settings
      WHERE id=1 AND enabled AND x_option_reserve_wei=10000000000000000000) THEN
    RAISE EXCEPTION 'SHARED_POOL_X_POLICY_DRIFT';
  END IF;

  v_shadow_before:=public.read_reward_shared_pool_capacity_shadow_v1('mainnet',v_app);
  IF v_shadow_before->>'mode'<>'SHADOW_ONLY'
    OR (v_shadow_before->>'fixedOutstandingWei')::numeric<0
    OR (v_shadow_before->>'oneWinnerWei')::numeric<=0
    OR (v_shadow_before->>'oneWinnerWei')::numeric>
       (v_shadow_before->>'poolWei')::numeric THEN
     RAISE EXCEPTION 'SHARED_POOL_CAPACITY_INVALID';
  END IF;

  UPDATE reward_admission_bridge.shared_pool_settings
    SET enabled=true,enabled_at=clock_timestamp()
   WHERE id=1 AND NOT enabled;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  IF v_changed<>1 THEN RAISE EXCEPTION 'SHARED_POOL_ACTIVATION_RACE'; END IF;

  v_mode:=public.read_reward_shared_pool_mode_v1('mainnet');
  v_shadow_after:=public.read_reward_shared_pool_capacity_shadow_v1('mainnet',v_app);
  v_preview:=public.read_reward_elastic_public_scenarios_v1('mainnet',v_app);
  IF v_mode->>'enabled'<>'true'
    OR v_shadow_after->>'mode'<>'SHADOW_ONLY'
    OR v_preview->>'mode'<>'ELASTIC_SCENARIOS'
    OR v_preview->>'oneWinnerWei'<>v_shadow_before->>'oneWinnerWei'
    OR v_preview->>'twoWinnersWei'<>v_shadow_before->>'twoWinnersWei'
    OR v_preview->>'threeWinnersWei'<>v_shadow_before->>'threeWinnersWei'
    OR v_shadow_after->>'oneWinnerWei'<>v_shadow_before->>'oneWinnerWei'
    THEN RAISE EXCEPTION 'SHARED_POOL_PREVIEW_CANONICAL_ACTIVATION_MISMATCH';
  END IF;
END;
$activate$;
