-- Stage only. No existing notices or attempt history are modified.
-- Preserve all eligibility, financial, finality and idempotency guards.
CREATE OR REPLACE FUNCTION public.commit_invitation_mission_auto_reset_v1(p_invite_code text, p_network text, p_expected_current_round_id bigint, p_target_dapp_round_id bigint, p_target_round_start_block bigint, p_target_round_end_block bigint, p_previous_vote_window_end_block bigint, p_chain_best_sealed_block bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
  v_cfg reward_admission_bridge.mission_auto_reset_settings_v1%rowtype;
  v_inv public.invitations%rowtype;
  v_prior reward_admission_bridge.mission_retry_attempts_v1%rowtype;
  v_latest_alloc bigint;
  v_original_round bigint;
  v_first_reset bigint;
  v_target bigint;
  v_prev_vote_round bigint;
  v_attempt_no integer;
  v_created_id bigint;
  v_event_id bigint;
  v_had_progress boolean := false;
  v_check_round bigint;
  v_last_end bigint;
  v_resolution reward_admission_bridge.mission_two_round_resolution_v1%rowtype;
BEGIN
  IF p_network NOT IN ('mainnet','testnet','testnet-staging') OR
     p_invite_code IS NULL OR upper(btrim(p_invite_code)) !~ '^[A-HJ-NP-Z2-9]{7}$' OR
     p_expected_current_round_id IS NULL OR p_target_dapp_round_id IS NULL OR
     p_target_round_start_block IS NULL OR p_target_round_end_block IS NULL OR
     p_previous_vote_window_end_block IS NULL OR p_chain_best_sealed_block IS NULL OR
     p_expected_current_round_id < 126 OR p_target_dapp_round_id < 126 OR
     p_target_round_start_block <= 0 OR
     p_target_round_end_block <= p_target_round_start_block OR
     p_previous_vote_window_end_block <= 0 OR
     p_chain_best_sealed_block < p_target_round_start_block THEN
    RAISE EXCEPTION 'INVALID_AUTO_RESET_PROOF';
  END IF;

  SELECT * INTO v_cfg FROM reward_admission_bridge.mission_auto_reset_settings_v1
  WHERE id = 1 FOR SHARE;
  IF NOT FOUND OR NOT v_cfg.enabled THEN
    RETURN jsonb_build_object('started',false,'reason','FEATURE_DISABLED');
  END IF;

  IF p_target_dapp_round_id < v_cfg.first_automatic_round_id OR
     p_target_dapp_round_id > p_expected_current_round_id OR
     p_chain_best_sealed_block <
       p_previous_vote_window_end_block + v_cfg.minimum_finality_blocks OR
     p_previous_vote_window_end_block >= p_target_round_start_block THEN
    RETURN jsonb_build_object('started',false,'reason','ROUND_FINALITY_OR_BOUNDS_UNVERIFIED');
  END IF;

  -- DB + service-chain round observations must agree; no speculative resets.
  SELECT max(vebetter_round_id) INTO v_latest_alloc
  FROM public.vebetter_round_allocations
  WHERE network = p_network AND
    app_id = '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  IF v_latest_alloc IS NULL OR
     v_latest_alloc + 1 <> p_expected_current_round_id THEN
    RETURN jsonb_build_object('started',false,'reason','UNVERIFIED_CURRENT_ROUND');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'veinvite_auto_reset:'||p_network||':'||upper(btrim(p_invite_code)), 0
  ));
  SELECT * INTO v_inv FROM public.invitations
  WHERE invite_code = upper(btrim(p_invite_code)) AND
    activation_network = p_network FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('started',false,'reason','INVITATION_MISSING');
  END IF;

  v_original_round := reward_admission_bridge.mission_original_entry_round_v1(v_inv);
  IF v_inv.status <> 'ACTIVATING' OR v_inv.reward_status <> 'PENDING' OR
     (v_inv.vote_completed = true AND (NOT v_cfg.two_round_policy_enabled OR v_inv.impact_sync_complete_at IS NOT NULL)) OR v_inv.sybil_status IN('REVIEW','BLOCKED') OR
     v_inv.ineligible_at IS NOT NULL OR v_inv.invitee_wallet IS NULL OR
     v_inv.eligibility_check_id IS NULL OR v_original_round IS NULL OR
     (v_inv.reward_cohort_round_id IS NULL AND NOT v_cfg.two_round_policy_enabled) OR
     v_inv.slot_released_at IS NOT NULL OR
     EXISTS (
       SELECT 1 FROM public.reward_queue_entries q
       WHERE q.invite_code = v_inv.invite_code AND q.reserved_amount_wei IS NOT NULL
     ) OR
     EXISTS (
       SELECT 1 FROM public.reward_payouts p
       WHERE p.invite_code = v_inv.invite_code
     ) OR
     EXISTS (
       SELECT 1 FROM reward_admission_bridge.holds h
       WHERE h.invite_code=v_inv.invite_code AND h.network=p_network AND h.status='HELD'
     ) OR
     EXISTS (
       SELECT 1 FROM public.sybil_v2_wallet_restrictions r
       WHERE r.network=p_network AND r.status='ACTIVE'
         AND r.wallet_address IN (lower(v_inv.inviter_wallet),lower(v_inv.invitee_wallet))
     ) OR
     EXISTS (
       SELECT 1 FROM public.sybil_v2_referral_assessments s
       WHERE s.invite_code=v_inv.invite_code
         AND s.state IN('RESTRICTED','HOLD','WATCH','ANALYSIS_FAILED')
     ) OR
     NOT EXISTS (
       SELECT 1 FROM public.eligibility_check_events e
       WHERE e.id=v_inv.eligibility_check_id AND
         e.invite_code=v_inv.invite_code AND
         e.wallet_address=lower(v_inv.invitee_wallet) AND
         e.network=p_network AND e.outcome='ELIGIBLE' AND
         e.entry_class IN('NEW','RETURNING') AND
         e.checked_block<=v_inv.activation_block
     ) THEN
    RETURN jsonb_build_object('started',false,'reason','INVITATION_PROTECTED');
  END IF;

  SELECT * INTO v_prior
  FROM reward_admission_bridge.mission_retry_attempts_v1
  WHERE invite_code=v_inv.invite_code ORDER BY attempt_no DESC LIMIT 1 FOR UPDATE;

  v_first_reset := greatest(v_original_round + 2,
                            v_cfg.first_automatic_round_id);
  IF p_expected_current_round_id < v_first_reset THEN
    RETURN jsonb_build_object('started',false,'reason','NOT_EXPIRED');
  END IF;
  v_target := v_first_reset +
    2 * ((p_expected_current_round_id - v_first_reset) / 2);
  IF v_target <> p_target_dapp_round_id OR
     p_expected_current_round_id NOT IN(v_target,v_target+1) THEN
    RETURN jsonb_build_object('started',false,'reason','ATTEMPT_ROUND_MISMATCH');
  END IF;

  IF v_prior.id IS NOT NULL AND v_prior.state='FINISHED' THEN
    RETURN jsonb_build_object('started',false,'reason','PREVIOUS_ATTEMPT_PROTECTED');
  END IF;
  -- Idempotent retries must be checked BEFORE previous-window expiry checks.
  IF v_prior.id IS NOT NULL AND v_prior.dapp_round_id = v_target THEN
    RETURN jsonb_build_object('started',false,'reason','ALREADY_RESET',
      'attemptNo',v_prior.attempt_no,'dappRoundId',v_target);
  END IF;
  v_prev_vote_round := coalesce(v_prior.dapp_round_id,
                                v_original_round) + 1;
  IF v_prev_vote_round >= v_target THEN
    RETURN jsonb_build_object('started',false,'reason','ATTEMPT_ROUND_MISMATCH');
  END IF;
  IF v_prior.id IS NOT NULL AND
     (v_prior.dapp_round_id >= v_target OR v_prior.state<>'ACTIVE') THEN
    RETURN jsonb_build_object('started',false,'reason','ATTEMPT_STATE_REVIEW');
  END IF;

  -- Never discard a durably recorded valid vote, even if the payout worker
  -- has not yet issued clearance/reservation. Protect delayed settlement.
  IF v_prior.id IS NOT NULL AND (
    EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_settlement_bindings_v1 b WHERE b.attempt_id=v_prior.id)
    OR (EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempt_events_v1 e
       WHERE e.attempt_id=v_prior.id AND e.event_type='ALLOCATION_VOTE')
      AND (NOT v_cfg.two_round_policy_enabled OR
        (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempt_events_v1 e
          WHERE e.attempt_id=v_prior.id AND e.event_type='DAPP_REWARD')=3))
  ) THEN
    RETURN jsonb_build_object('started',false,'reason','PREVIOUS_ATTEMPT_PROTECTED');
  END IF;

  IF v_cfg.two_round_policy_enabled THEN
    v_check_round:=v_prev_vote_round-1;
    WHILE v_check_round<v_target LOOP
      SELECT * INTO v_resolution FROM reward_admission_bridge.mission_two_round_resolution_v1
       WHERE invitation_id=v_inv.id AND network=p_network AND dapp_round_id=v_check_round;
      IF NOT FOUND OR v_resolution.complete OR
         v_resolution.finalized_through_block<v_resolution.vote_end_block+v_cfg.minimum_finality_blocks OR
         v_resolution.finalized_through_block>p_chain_best_sealed_block OR
         v_resolution.vote_end_block>=p_target_round_start_block
      THEN RETURN jsonb_build_object('started',false,'reason','FULL_WINDOW_PROOF_REQUIRED'); END IF;
      -- Only finalized, canonical mission evidence determines whether progress was lost.
      -- Include every validated expired window if the worker had missed a rollover.
      v_had_progress := v_had_progress OR jsonb_array_length(v_resolution.events)>0;
      v_last_end:=v_resolution.vote_end_block;
      v_check_round:=greatest(v_check_round+2,v_first_reset);
    END LOOP;
    IF v_last_end IS DISTINCT FROM p_previous_vote_window_end_block THEN
      RETURN jsonb_build_object('started',false,'reason','FULL_WINDOW_BOUNDS_MISMATCH');
    END IF;
  END IF;

  v_attempt_no := coalesce(v_prior.attempt_no,0)+1;
  IF v_attempt_no > 100 THEN
    RETURN jsonb_build_object('started',false,'reason','ATTEMPT_LIMIT_REVIEW');
  END IF;

  IF v_prior.id IS NOT NULL THEN
    UPDATE reward_admission_bridge.mission_retry_attempts_v1
    SET state='EXPIRED', expired_at=clock_timestamp()
    WHERE id=v_prior.id AND state='ACTIVE';
  END IF;

  -- Not the user's login/claim time: exact verified N+2 round starting block.
  INSERT INTO reward_admission_bridge.mission_retry_attempts_v1
   (invitation_id,invite_code,network,attempt_no,dapp_round_id,
    attempt_start_block,round_start_block,round_end_block)
  VALUES
   (v_inv.id,v_inv.invite_code,p_network,v_attempt_no,v_target,
    p_target_round_start_block,p_target_round_start_block,p_target_round_end_block)
  RETURNING id INTO v_created_id;

  -- Only a verified incomplete original mission can have a legacy partial vote.
  -- Archive that derived checkpoint; the underlying immutable events stay intact.
  IF v_cfg.two_round_policy_enabled AND v_inv.vote_completed THEN
    INSERT INTO reward_admission_bridge.mission_two_round_reset_snapshot_v1(attempt_id,old_vote)
    VALUES(v_created_id,jsonb_build_object('vote_completed',v_inv.vote_completed,'vote_completed_at',v_inv.vote_completed_at,
      'vote_completed_block',v_inv.vote_completed_block,'vote_round_id',v_inv.vote_round_id));
    UPDATE public.invitations SET vote_completed=false,vote_completed_at=NULL,vote_completed_block=NULL,vote_round_id=NULL
      WHERE id=v_inv.id RETURNING * INTO v_inv;
    IF v_inv.status<>'ACTIVATING' OR v_inv.reward_status<>'PENDING' OR v_inv.vote_completed IS DISTINCT FROM false
    THEN RAISE EXCEPTION 'MISSION_RESET_PROTECTED_CHECKPOINT'; END IF;
  END IF;

  -- Empty finalized windows renew silently. Keep legacy policy conservative
  -- when it does not have the canonical two-round resolution evidence.
  IF v_had_progress OR NOT v_cfg.two_round_policy_enabled THEN
  -- Same transaction + exact round-specific key: at most one visible notice
  -- per attempt, addressed to the INVITEE, not the inviter.
  INSERT INTO public.invite_notification_history
   (inviter_wallet,invite_code,kind,stage,event_at,
    reward_amount_wei,dapp_progress,collapsed_progress,friend_wallet,
    recipient_wallet,dedupe_key)
  VALUES
   (lower(v_inv.inviter_wallet),v_inv.invite_code,'MISSION_PROGRESS_RESET',2,
    clock_timestamp(),NULL,0,false,lower(v_inv.invitee_wallet),
    lower(v_inv.invitee_wallet),
    'mission-auto-reset-v1:'||v_inv.invite_code||':'||v_target)
  ON CONFLICT (dedupe_key) DO NOTHING RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    -- The notification must be committed exactly once with the attempt.
    RAISE EXCEPTION 'AUTO_RESET_NOTIFICATION_DEDUPE_CONFLICT';
  END IF;
  END IF;

  RETURN jsonb_build_object(
    'started',true,'attemptNo',v_attempt_no,
    'attemptId',v_created_id,'dappRoundId',v_target,
    'voteRoundId',v_target+1,'notificationId',v_event_id,
    'notificationSent',v_event_id IS NOT NULL,
    'friendSlotPreserved',true
  );
END;
$function$;
