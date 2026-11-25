-- DRAFT ONLY. Never apply to production independently.
-- Captured live function definitions; fingerprints for migration review:
-- bind_mission_retry_completion_v1: a8ebce39cd9ccfc38b1e60144ae8c5ab
-- commit_reward_vote_round_close_batch_v1: e80a04af783a688bfdb68bea20f1f50f
-- mission_retry_assessment_is_current_v1: 472b5ad98eaa07c3f62da5572de01d17
-- publish_mission_retry_completion_checkpoint_v1: 1f85cc183e4a8a7916cde3c3520700e4
-- Requires verified two-round event bounds, reset expiry proof, Sybil analyzer and initial-mission integration.

CREATE OR REPLACE FUNCTION public.bind_mission_retry_completion_v1(p_network text, p_invite_code text, p_attempt_no integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
  i public.invitations%rowtype;
  a reward_admission_bridge.mission_retry_attempts_v1%rowtype;
  v reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
  last_event reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
  f public.vebetter_round_allocations%rowtype;
  b reward_admission_bridge.mission_retry_settlement_bindings_v1%rowtype;
  dapp_count integer;
  conversion_count integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_auto_reset_settings_v1
    WHERE id=1 AND enabled) THEN
    RETURN jsonb_build_object('bound',false,'reason','FEATURE_DISABLED');
  END IF;
  SELECT * INTO i FROM public.invitations WHERE invite_code=p_invite_code
    AND activation_network=p_network FOR UPDATE;
  IF NOT FOUND OR i.status NOT IN('ACTIVATING','UNDER_REVIEW')
    OR i.reward_status<>'PENDING' OR i.sybil_status='BLOCKED'
    OR i.ineligible_at IS NOT NULL OR i.slot_released_at IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=i.invite_code)
    OR EXISTS(SELECT 1 FROM public.reward_payouts p WHERE p.invite_code=i.invite_code)
  THEN RETURN jsonb_build_object('bound',false,'reason','INVITATION_PROTECTED'); END IF;

  SELECT * INTO a FROM reward_admission_bridge.mission_retry_attempts_v1
  WHERE invitation_id=i.id AND network=p_network AND state='ACTIVE' FOR UPDATE;
  IF NOT FOUND OR a.attempt_no IS DISTINCT FROM p_attempt_no THEN
    RETURN jsonb_build_object('bound',false,'reason','STALE_ATTEMPT');
  END IF;
  SELECT * INTO v FROM reward_admission_bridge.mission_retry_attempt_events_v1
    WHERE attempt_id=a.id AND event_type='ALLOCATION_VOTE';
  IF NOT FOUND OR v.vote_round_id IS DISTINCT FROM a.vote_round_id
     OR a.vote_window_start_block IS NULL OR a.vote_window_end_block IS NULL
     OR v.block_number NOT BETWEEN a.vote_window_start_block AND a.vote_window_end_block
     OR a.proof_finalized_through_block IS NULL
     OR v.block_number>a.proof_finalized_through_block THEN
    RETURN jsonb_build_object('bound',false,'reason','FINALIZED_VOTE_REQUIRED');
  END IF;
  SELECT count(*) FILTER(WHERE event_type='DAPP_REWARD'),
         count(*) FILTER(WHERE event_type='VOT3_CONVERSION')
  INTO dapp_count,conversion_count
  FROM reward_admission_bridge.mission_retry_attempt_events_v1
  WHERE attempt_id=a.id AND block_number<=a.proof_finalized_through_block;
  IF dapp_count<>3 OR conversion_count<>1 THEN
    RETURN jsonb_build_object('bound',false,'reason','MISSION_PROOF_INCOMPLETE');
  END IF;

  -- The completion event is the last of the actual required events, not necessarily the vote.
  SELECT * INTO last_event FROM reward_admission_bridge.mission_retry_attempt_events_v1
    WHERE attempt_id=a.id AND event_type IN ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
    ORDER BY block_number DESC,tx_index DESC,clause_index DESC LIMIT 1;
  IF NOT FOUND OR last_event.block_number>a.proof_finalized_through_block
     OR last_event.block_number>a.vote_window_end_block THEN
    RETURN jsonb_build_object('bound',false,'reason','MISSION_PROOF_INCOMPLETE');
  END IF;

  SELECT * INTO b FROM reward_admission_bridge.mission_retry_settlement_bindings_v1
    WHERE invitation_id=i.id;
  IF FOUND THEN
    IF b.attempt_id<>a.id OR b.completion_event_id<>last_event.id OR b.completion_block<>last_event.block_number THEN
      RAISE EXCEPTION 'MISSION_SETTLEMENT_BINDING_CONFLICT';
    END IF;
    RETURN jsonb_build_object('bound',true,'completionRoundId',b.completion_round_id,
      'fundingAllocationReceiptId',b.funding_allocation_receipt_id::text);
  END IF;

  -- Round R receives the allocation receipt for R-1. Never select the
  -- current cron/claim round or the immutable original invitation round.
  SELECT * INTO f FROM public.vebetter_round_allocations
  WHERE network=p_network AND
    app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
    AND vebetter_round_id=a.vote_round_id-1
    AND claim_block_number IS NOT NULL
    AND claim_block_number<=a.proof_finalized_through_block
  ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('bound',false,'reason','FUNDING_NOT_FINALIZED'); END IF;

  INSERT INTO reward_admission_bridge.mission_retry_settlement_bindings_v1
    (attempt_id,invitation_id,network,completion_round_id,funding_allocation_receipt_id,
     completion_event_id,completion_block,finalized_through_block)
  VALUES (a.id,i.id,p_network,a.vote_round_id,f.id,last_event.id,last_event.block_number,a.proof_finalized_through_block);
  RETURN jsonb_build_object('bound',true,'completionRoundId',a.vote_round_id,
    'fundingAllocationReceiptId',f.id::text);
END;
$function$;


CREATE OR REPLACE FUNCTION public.publish_mission_retry_completion_checkpoint_v1(p_network text, p_invite_code text, p_attempt_no integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
 i public.invitations%rowtype;
 a reward_admission_bridge.mission_retry_attempts_v1%rowtype;
 b reward_admission_bridge.mission_retry_settlement_bindings_v1%rowtype;
 d reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
 c reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
 v reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
 last_event reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_auto_reset_settings_v1
   WHERE id=1 AND enabled) THEN
   RETURN jsonb_build_object('published',false,'reason','FEATURE_DISABLED');
 END IF;
 SELECT * INTO i FROM public.invitations WHERE invite_code=p_invite_code
   AND activation_network=p_network FOR UPDATE;
 IF NOT FOUND OR i.status NOT IN('ACTIVATING','UNDER_REVIEW')
    OR i.reward_status<>'PENDING' OR i.sybil_status='BLOCKED'
    OR i.ineligible_at IS NOT NULL OR i.slot_released_at IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=i.invite_code)
    OR EXISTS(SELECT 1 FROM public.reward_payouts p WHERE p.invite_code=i.invite_code)
    OR EXISTS(SELECT 1 FROM reward_admission_bridge.holds h WHERE h.invite_code=i.invite_code
        AND h.network=p_network AND h.status='HELD')
 THEN RETURN jsonb_build_object('published',false,'reason','INVITATION_PROTECTED'); END IF;

 SELECT * INTO a FROM reward_admission_bridge.mission_retry_attempts_v1
   WHERE invitation_id=i.id AND network=p_network AND state='ACTIVE' FOR UPDATE;
 IF NOT FOUND OR a.attempt_no IS DISTINCT FROM p_attempt_no THEN
   RETURN jsonb_build_object('published',false,'reason','STALE_ATTEMPT');
 END IF;
 SELECT * INTO b FROM reward_admission_bridge.mission_retry_settlement_bindings_v1
   WHERE attempt_id=a.id AND invitation_id=i.id AND network=p_network;
 IF NOT FOUND OR b.completion_round_id<>a.vote_round_id THEN
   RETURN jsonb_build_object('published',false,'reason','FUNDING_BINDING_MISSING');
 END IF;
 SELECT * INTO d FROM reward_admission_bridge.mission_retry_attempt_events_v1
   WHERE attempt_id=a.id AND event_type='DAPP_REWARD'
   ORDER BY block_number DESC,tx_index DESC,clause_index DESC LIMIT 1;
 SELECT * INTO c FROM reward_admission_bridge.mission_retry_attempt_events_v1
   WHERE attempt_id=a.id AND event_type='VOT3_CONVERSION';
 SELECT * INTO v FROM reward_admission_bridge.mission_retry_attempt_events_v1
   WHERE attempt_id=a.id AND event_type='ALLOCATION_VOTE';
 SELECT * INTO last_event FROM reward_admission_bridge.mission_retry_attempt_events_v1
   WHERE attempt_id=a.id AND event_type IN ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
   ORDER BY block_number DESC,tx_index DESC,clause_index DESC LIMIT 1;
 IF d.id IS NULL OR c.id IS NULL OR v.id IS NULL
   OR (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempt_events_v1
      WHERE attempt_id=a.id AND event_type='DAPP_REWARD')<>3
   OR last_event.id IS DISTINCT FROM b.completion_event_id
   OR last_event.block_number IS DISTINCT FROM b.completion_block
   OR last_event.block_number>b.finalized_through_block
   OR v.vote_round_id IS DISTINCT FROM b.completion_round_id
   OR v.block_number>b.finalized_through_block
   OR d.block_number NOT BETWEEN a.attempt_start_block AND a.vote_window_end_block
   OR (v.block_number,v.tx_index,v.clause_index)<=(c.block_number,c.tx_index,c.clause_index)
 THEN RAISE EXCEPTION 'MISSION_RETRY_COMPLETION_CHECKPOINT_INVALID'; END IF;

 -- Never change the original activation/entry/funding binding. The effective
 -- funding accessor already selects the immutable completion-round receipt.
 IF i.apps_completed=3 AND i.apps_completed_block=d.block_number
    AND i.apps_completed_at=d.block_timestamp AND i.vot3_converted
    AND i.vot3_conversion_tx_id=c.tx_id AND i.vot3_converted_block=c.block_number
    AND i.vot3_converted_at=c.block_timestamp AND i.vot3_conversion_amount_wei=c.amount_wei
    AND i.vote_completed AND i.vote_round_id=v.vote_round_id
    AND i.vote_completed_block=v.block_number AND i.vote_completed_at=v.block_timestamp
    AND i.impact_sync_complete_at IS NOT NULL THEN
   RETURN jsonb_build_object('published',true,'reused',true,'completionRoundId',v.vote_round_id);
 END IF;
 UPDATE public.invitations
 SET apps_completed=3,rewards_received=greatest(coalesce(i.rewards_received,0),3),
   apps_completed_at=d.block_timestamp,apps_completed_block=d.block_number,
   vot3_converted=true,vot3_converted_at=c.block_timestamp,
   vot3_converted_block=c.block_number,vot3_conversion_tx_id=c.tx_id,
   vot3_conversion_amount_wei=c.amount_wei,
   vote_completed=true,vote_completed_at=v.block_timestamp,
   vote_completed_block=v.block_number,vote_round_id=v.vote_round_id,
   impact_last_synced_block=greatest(coalesce(i.impact_last_synced_block,0),b.finalized_through_block),
   impact_last_synced_at=clock_timestamp(),impact_sync_complete_at=clock_timestamp()
 WHERE id=i.id RETURNING * INTO i;
 IF i.reward_status IS DISTINCT FROM 'PENDING'
    OR i.status NOT IN('ACTIVATING','UNDER_REVIEW')
    OR i.vote_completed IS DISTINCT FROM true
    OR i.vote_round_id IS DISTINCT FROM v.vote_round_id
    OR i.vote_completed_block IS DISTINCT FROM v.block_number
    OR i.vot3_converted IS DISTINCT FROM true
    OR i.apps_completed IS DISTINCT FROM 3 THEN
   RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_CHECKPOINT_REJECTED';
 END IF;
 RETURN jsonb_build_object('published',true,'reused',false,'completionRoundId',v.vote_round_id);
END;
$function$;


CREATE OR REPLACE FUNCTION public.mission_retry_assessment_is_current_v1(p_invite_code text, p_network text, p_revision bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
 SELECT EXISTS (
  SELECT 1 FROM public.invitations i
  JOIN reward_admission_bridge.mission_retry_attempts_v1 a
    ON a.invitation_id=i.id AND a.network=i.activation_network AND a.state='ACTIVE'
  JOIN reward_admission_bridge.mission_retry_settlement_bindings_v1 b
    ON b.attempt_id=a.id AND b.invitation_id=i.id AND b.network=a.network
  JOIN public.sybil_v2_referral_assessments s ON s.invite_code=i.invite_code AND s.network=a.network
  JOIN reward_admission_bridge.mission_retry_attempt_events_v1 last_event ON last_event.id=b.completion_event_id
    AND last_event.attempt_id=a.id AND last_event.block_number=b.completion_block
  JOIN reward_admission_bridge.mission_retry_attempt_events_v1 v
    ON v.attempt_id=a.id AND v.event_type='ALLOCATION_VOTE'
  WHERE i.invite_code=p_invite_code AND i.activation_network=p_network
    AND s.revision=p_revision AND s.state='CLEAR'
    AND s.evidence_cutoff_block>=b.completion_block
    AND s.assessed_at>=last_event.block_timestamp
    AND s.evidence_summary->>'missionRetryAttemptNo'=a.attempt_no::text
    AND s.evidence_summary->>'missionRetryCompletionBlock'=b.completion_block::text
    AND '["HISTORICAL_CHAIN","FUNDING_CHAIN","MISSION_BEHAVIOR","SECURITY_IDENTITY","VEPASSPORT","CHAIN_FINALITY"]'::jsonb
       <@ s.completed_checks
    AND s.required_checks<@s.completed_checks
    AND i.vote_completed IS TRUE AND i.vote_round_id=b.completion_round_id
    AND i.vote_completed_block=v.block_number AND i.vote_completed_at=v.block_timestamp
    AND i.impact_sync_complete_at IS NOT NULL
    AND i.sybil_status NOT IN ('REVIEW','BLOCKED')
    AND i.ineligible_at IS NULL AND i.slot_released_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.sybil_v2_wallet_restrictions k
     WHERE k.network=p_network AND k.status='ACTIVE'
       AND k.wallet_address IN(lower(i.inviter_wallet),lower(i.invitee_wallet)))
 );
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

 -- Retry vote evidence is stored separately from the original invite.
 -- Before fixing amounts for this round, every durable retry in the window
 -- must have either a published verified vote or a finalized full-window scan.
 -- Otherwise the batch could omit an eligible late-indexed retry.
 IF EXISTS (
   SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1 a
   JOIN public.invitations i ON i.id=a.invitation_id AND i.activation_network=a.network
   WHERE a.network=p_network AND a.vote_round_id=v_vote_round
     AND i.status<>'CANCELLED' AND i.sybil_status<>'BLOCKED'
     AND i.reward_status NOT IN('FORFEITED','PAID') AND i.ineligible_at IS NULL
     AND (
       (EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempt_events_v1 e
         WHERE e.attempt_id=a.id AND e.event_type='ALLOCATION_VOTE')
        AND NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_settlement_bindings_v1 b
         WHERE b.attempt_id=a.id AND b.invitation_id=i.id
           AND b.completion_round_id=v_vote_round
           AND i.vote_completed IS TRUE AND i.vote_round_id=v_vote_round
           AND EXISTS (SELECT 1 FROM reward_admission_bridge.mission_retry_attempt_events_v1 v
             WHERE v.attempt_id=b.attempt_id AND v.event_type='ALLOCATION_VOTE'
               AND v.vote_round_id=i.vote_round_id AND v.block_number=i.vote_completed_block
               AND v.block_timestamp=i.vote_completed_at)))
       OR
       (NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempt_events_v1 e
         WHERE e.attempt_id=a.id AND e.event_type='ALLOCATION_VOTE')
        AND (a.vote_window_end_block IS NULL OR a.proof_finalized_through_block IS NULL
          OR a.proof_finalized_through_block<a.vote_window_end_block))
     )
 ) THEN
   RETURN jsonb_build_object('mode','DEFER','reason','AWAIT_RETRY_VOTE_SCAN','reserved',false);
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
      SELECT 1 FROM public.read_mission_effective_proof_events_v1(i.invite_code,p_network) e
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
   SELECT c.invite_code,c.reward_cohort_round_id,
          c.reward_funding_allocation_receipt_id
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
