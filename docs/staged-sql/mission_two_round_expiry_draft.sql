-- STAGED: apply only as part of the reviewed flexible mission release.
-- Source fingerprints: commit_invitation_mission_auto_reset_v1=ea3c62042d490487939ebebfa39704b2; read_mission_auto_reset_progress_v1=b1c3ef6476206621f452f8427496468d; read_mission_auto_reset_settings_v1=408c8a7323c18577314c12e373e6cb3e
ALTER TABLE reward_admission_bridge.mission_auto_reset_settings_v1
 ADD COLUMN IF NOT EXISTS two_round_policy_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS reward_admission_bridge.mission_two_round_resolution_v1 (
 invitation_id uuid NOT NULL REFERENCES public.invitations(id) ON DELETE RESTRICT,
 network text NOT NULL CHECK(network IN('mainnet','testnet','testnet-staging')),
 dapp_round_id bigint NOT NULL CHECK(dapp_round_id>0),
 attempt_start_block bigint NOT NULL CHECK(attempt_start_block>0),
 dapp_end_block bigint NOT NULL,
 vote_start_block bigint NOT NULL,
 vote_end_block bigint NOT NULL,
 finalized_through_block bigint NOT NULL,
 complete boolean NOT NULL,
 events jsonb NOT NULL CHECK(jsonb_typeof(events)='array'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(invitation_id,network,dapp_round_id),
 CHECK(attempt_start_block<=dapp_end_block AND dapp_end_block<vote_start_block
       AND vote_start_block<=vote_end_block AND finalized_through_block>=vote_start_block)
);
ALTER TABLE reward_admission_bridge.mission_two_round_resolution_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reward_admission_bridge.mission_two_round_resolution_v1 FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS reward_admission_bridge.mission_two_round_reset_snapshot_v1 (
 attempt_id bigint PRIMARY KEY REFERENCES reward_admission_bridge.mission_retry_attempts_v1(id) ON DELETE RESTRICT,
 old_vote jsonb NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE reward_admission_bridge.mission_two_round_reset_snapshot_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reward_admission_bridge.mission_two_round_reset_snapshot_v1 FROM PUBLIC,anon,authenticated;

-- Trusted server writes only after an exact, finalized chain scan.
-- Revalidate event shape, distinct apps, order, round, and finality.
CREATE OR REPLACE FUNCTION public.record_mission_two_round_resolution_v1(
 p_network text,p_invite_code text,p_dapp_round_id bigint,p_start_block bigint,
 p_dapp_end_block bigint,p_vote_start_block bigint,p_vote_end_block bigint,
 p_finalized_block bigint,p_events jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $resolution$
DECLARE
 i public.invitations%rowtype;
 cfg reward_admission_bridge.mission_auto_reset_settings_v1%rowtype;
 a reward_admission_bridge.mission_retry_attempts_v1%rowtype;
 old_proof reward_admission_bridge.mission_two_round_resolution_v1%rowtype;
 e record; first_app record; conversion record; vote record;
 app_count integer; distinct_count integer; conversion_count integer; vote_count integer;
 complete boolean; normalized jsonb; first_reset bigint;
BEGIN
 SELECT * INTO cfg FROM reward_admission_bridge.mission_auto_reset_settings_v1 WHERE id=1 FOR SHARE;
 IF NOT FOUND OR NOT cfg.two_round_policy_enabled THEN
  RETURN jsonb_build_object('recorded',false,'reason','FEATURE_DISABLED'); END IF;
 IF p_network NOT IN('mainnet','testnet','testnet-staging') OR p_invite_code IS NULL
  OR p_invite_code !~ '^[A-HJ-NP-Z2-9]{7}$' OR p_dapp_round_id IS NULL OR p_dapp_round_id<1
  OR p_start_block IS NULL OR p_start_block<1 OR p_dapp_end_block IS NULL
  OR p_vote_start_block IS NULL OR p_vote_end_block IS NULL OR p_finalized_block IS NULL
  OR p_start_block>p_dapp_end_block OR p_dapp_end_block>=p_vote_start_block
  OR p_vote_start_block>p_vote_end_block OR p_finalized_block<p_vote_start_block
  OR jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_array_length(p_events)>5
 THEN RAISE EXCEPTION 'MISSION_RESOLUTION_INVALID_INPUT'; END IF;
 SELECT * INTO i FROM public.invitations WHERE invite_code=p_invite_code AND activation_network=p_network FOR UPDATE;
 IF NOT FOUND OR i.reward_status<>'PENDING' OR i.status NOT IN('ACTIVATING','UNDER_REVIEW','COMPLETED')
  OR i.reward_cohort_round_id IS NULL OR i.eligibility_check_id IS NULL OR i.invitee_wallet IS NULL
  OR i.sybil_status='BLOCKED' OR i.ineligible_at IS NOT NULL OR i.slot_released_at IS NOT NULL
 THEN RETURN jsonb_build_object('recorded',false,'reason','INVITATION_PROTECTED'); END IF;
 IF p_dapp_round_id=i.reward_cohort_round_id THEN
  IF p_start_block IS DISTINCT FROM i.activation_block THEN RAISE EXCEPTION 'MISSION_RESOLUTION_ENTRY_MISMATCH'; END IF;
 ELSE
  first_reset:=greatest(i.reward_cohort_round_id+2,cfg.first_automatic_round_id);
  IF p_dapp_round_id<first_reset OR mod(p_dapp_round_id-first_reset,2)<>0
  THEN RAISE EXCEPTION 'MISSION_RESOLUTION_ROUND_MISMATCH'; END IF;
  SELECT * INTO a FROM reward_admission_bridge.mission_retry_attempts_v1
   WHERE invitation_id=i.id AND network=p_network AND dapp_round_id=p_dapp_round_id;
  IF FOUND AND (a.attempt_start_block<>p_start_block OR a.round_end_block<>p_dapp_end_block
     OR a.vote_window_start_block IS DISTINCT FROM p_vote_start_block
     OR a.vote_window_end_block IS DISTINCT FROM p_vote_end_block)
  THEN RAISE EXCEPTION 'MISSION_RESOLUTION_ATTEMPT_MISMATCH'; END IF;
 END IF;
 FOR e IN SELECT * FROM jsonb_to_recordset(p_events) AS x(event_type text,app_id text,amount_wei text,
  vote_round_id bigint,tx_id text,block_number bigint,tx_index integer,clause_index integer,block_timestamp timestamptz)
 LOOP
  IF e.event_type IS NULL OR e.event_type NOT IN('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
   OR e.tx_id IS NULL OR e.tx_id !~ '^0x[0-9a-f]{64}$'
   OR e.block_number IS NULL OR e.block_number<p_start_block OR e.block_number>least(p_finalized_block,p_vote_end_block)
   OR e.tx_index IS NULL OR e.tx_index<0 OR e.clause_index IS NULL OR e.clause_index<0 OR e.block_timestamp IS NULL
  THEN RAISE EXCEPTION 'MISSION_RESOLUTION_EVENT_INVALID'; END IF;
  IF e.event_type='ALLOCATION_VOTE' THEN
   IF e.vote_round_id IS DISTINCT FROM p_dapp_round_id+1 OR e.block_number<p_vote_start_block
    OR e.app_id IS NOT NULL OR e.amount_wei IS NOT NULL THEN RAISE EXCEPTION 'MISSION_RESOLUTION_VOTE_INVALID'; END IF;
  ELSE
   IF e.amount_wei IS NULL OR e.amount_wei !~ '^[0-9]+$' THEN RAISE EXCEPTION 'MISSION_RESOLUTION_AMOUNT_INVALID'; END IF;
   IF e.amount_wei::numeric<=0 OR e.vote_round_id IS NOT NULL THEN RAISE EXCEPTION 'MISSION_RESOLUTION_AMOUNT_INVALID'; END IF;
   IF e.event_type='DAPP_REWARD' AND (e.app_id IS NULL OR e.app_id !~ '^0x[0-9a-f]{64}$'
    OR e.app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e')
   THEN RAISE EXCEPTION 'MISSION_RESOLUTION_APP_INVALID'; END IF;
   IF e.event_type='VOT3_CONVERSION' AND e.app_id IS NOT NULL THEN RAISE EXCEPTION 'MISSION_RESOLUTION_CONVERSION_INVALID'; END IF;
  END IF;
 END LOOP;
 SELECT count(*) FILTER(WHERE event_type='DAPP_REWARD'),
  count(DISTINCT app_id) FILTER(WHERE event_type='DAPP_REWARD'),
  count(*) FILTER(WHERE event_type='VOT3_CONVERSION'),count(*) FILTER(WHERE event_type='ALLOCATION_VOTE'),
  coalesce(jsonb_agg(to_jsonb(x) ORDER BY block_number,tx_index,clause_index,event_type,app_id),'[]'::jsonb)
 INTO app_count,distinct_count,conversion_count,vote_count,normalized
 FROM jsonb_to_recordset(p_events) AS x(event_type text,app_id text,amount_wei text,vote_round_id bigint,
  tx_id text,block_number bigint,tx_index integer,clause_index integer,block_timestamp timestamptz);
 IF app_count>3 OR app_count<>distinct_count OR conversion_count>1 OR vote_count>1
  OR (conversion_count=1 AND app_count=0) OR (vote_count=1 AND conversion_count<>1)
 THEN RAISE EXCEPTION 'MISSION_RESOLUTION_EVENT_COUNT'; END IF;
 IF conversion_count=1 THEN
  SELECT * INTO first_app FROM jsonb_to_recordset(normalized) AS x(event_type text,block_number bigint,tx_index integer,clause_index integer)
    WHERE event_type='DAPP_REWARD' ORDER BY block_number,tx_index,clause_index LIMIT 1;
  SELECT * INTO conversion FROM jsonb_to_recordset(normalized) AS x(event_type text,block_number bigint,tx_index integer,clause_index integer)
    WHERE event_type='VOT3_CONVERSION';
  IF (conversion.block_number,conversion.tx_index,conversion.clause_index)<=(first_app.block_number,first_app.tx_index,first_app.clause_index)
  THEN RAISE EXCEPTION 'MISSION_RESOLUTION_CONVERSION_ORDER'; END IF;
 END IF;
 IF vote_count=1 THEN
  SELECT * INTO vote FROM jsonb_to_recordset(normalized) AS x(event_type text,block_number bigint,tx_index integer,clause_index integer)
    WHERE event_type='ALLOCATION_VOTE';
  IF (vote.block_number,vote.tx_index,vote.clause_index)<=(conversion.block_number,conversion.tx_index,conversion.clause_index)
  THEN RAISE EXCEPTION 'MISSION_RESOLUTION_VOTE_ORDER'; END IF;
 END IF;
 complete:=app_count=3 AND conversion_count=1 AND vote_count=1;
 IF NOT complete AND p_finalized_block<p_vote_end_block+cfg.minimum_finality_blocks
 THEN RETURN jsonb_build_object('recorded',false,'reason','WINDOW_NOT_FINALIZED'); END IF;
 SELECT * INTO old_proof FROM reward_admission_bridge.mission_two_round_resolution_v1
  WHERE invitation_id=i.id AND network=p_network AND dapp_round_id=p_dapp_round_id FOR UPDATE;
 IF FOUND THEN
  IF (old_proof.attempt_start_block,old_proof.dapp_end_block,old_proof.vote_start_block,old_proof.vote_end_block,old_proof.complete,old_proof.events)
   IS DISTINCT FROM (p_start_block,p_dapp_end_block,p_vote_start_block,p_vote_end_block,complete,normalized)
  THEN RAISE EXCEPTION 'MISSION_RESOLUTION_IMMUTABLE_CONFLICT'; END IF;
  RETURN jsonb_build_object('recorded',true,'complete',complete,'reused',true);
 END IF;
 INSERT INTO reward_admission_bridge.mission_two_round_resolution_v1
  (invitation_id,network,dapp_round_id,attempt_start_block,dapp_end_block,vote_start_block,vote_end_block,finalized_through_block,complete,events)
 VALUES(i.id,p_network,p_dapp_round_id,p_start_block,p_dapp_end_block,p_vote_start_block,p_vote_end_block,p_finalized_block,complete,normalized);
 RETURN jsonb_build_object('recorded',true,'complete',complete,'reused',false);
END;
$resolution$;
REVOKE ALL ON FUNCTION public.record_mission_two_round_resolution_v1(text,text,bigint,bigint,bigint,bigint,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_mission_two_round_resolution_v1(text,text,bigint,bigint,bigint,bigint,bigint,bigint,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.read_mission_auto_reset_settings_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
  SELECT jsonb_build_object(
    'enabled',s.enabled,
    'twoRoundPolicyEnabled',s.two_round_policy_enabled,
    'firstAutomaticRoundId',s.first_automatic_round_id,
    'minimumFinalityBlocks',s.minimum_finality_blocks
  )
  FROM reward_admission_bridge.mission_auto_reset_settings_v1 s WHERE s.id=1;
$function$;

CREATE OR REPLACE FUNCTION public.read_mission_auto_reset_progress_v1(p_network text, p_invite_codes text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'inviteCode',a.invite_code,'attemptNo',a.attempt_no,
    'dappRoundId',a.dapp_round_id,'voteRoundId',a.vote_round_id,
    'attemptStartBlock',a.attempt_start_block,
    'dappEndBlock',a.round_end_block,
    'voteStartBlock',a.vote_window_start_block,
    'voteEndBlock',a.vote_window_end_block,
    'finalizedThroughBlock',a.proof_finalized_through_block,
    'appsCompleted',coalesce(d.apps,0),
    'appIds',coalesce(d.app_ids,'[]'::jsonb),
    'appsCompletedAt',case when d.apps=3 then d.last_at end,
    'appsCompletedBlock',case when d.apps=3 then d.last_block end,
    'vot3Converted',cv.id IS NOT NULL,
    'conversionAmountWei',cv.amount_wei,'conversionTxId',cv.tx_id,
    'conversionBlock',cv.block_number,'conversionAt',cv.block_timestamp,
    'voteObserved',v.id IS NOT NULL,
    'voteCompleted',v.id IS NOT NULL AND d.apps=3 AND cv.id IS NOT NULL,
    'voteBlock',v.block_number,'voteAt',v.block_timestamp,
    -- Informational funding target, not a reservation or eligibility grant.
    'completionRoundId',case when v.id IS NOT NULL AND d.apps=3 AND cv.id IS NOT NULL
       then a.vote_round_id end,
    'fundingAllocationReceiptId',case when v.id IS NOT NULL AND d.apps=3 AND cv.id IS NOT NULL
       then funding.id::text end
  ) ORDER BY a.invite_code),'[]'::jsonb)
  FROM reward_admission_bridge.mission_retry_attempts_v1 a
  JOIN public.invitations i ON i.id=a.invitation_id
    AND i.invite_code=a.invite_code AND i.activation_network=a.network
  LEFT JOIN LATERAL (
    SELECT count(*)::integer apps,jsonb_agg(e.app_id ORDER BY e.block_number,e.tx_index,e.clause_index) app_ids,
      max(e.block_number) last_block,max(e.block_timestamp) last_at
    FROM (SELECT * FROM reward_admission_bridge.mission_retry_attempt_events_v1 e
      WHERE e.attempt_id=a.id AND e.event_type='DAPP_REWARD'
      ORDER BY e.block_number,e.tx_index,e.clause_index LIMIT 3) e
  ) d ON true
  LEFT JOIN reward_admission_bridge.mission_retry_attempt_events_v1 cv
    ON cv.attempt_id=a.id AND cv.event_type='VOT3_CONVERSION'
  LEFT JOIN reward_admission_bridge.mission_retry_attempt_events_v1 v
    ON v.attempt_id=a.id AND v.event_type='ALLOCATION_VOTE'
  LEFT JOIN LATERAL (
    SELECT f.id FROM public.vebetter_round_allocations f
    WHERE f.network=a.network
      AND f.app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
      AND f.vebetter_round_id=a.vote_round_id-1
    ORDER BY f.id DESC LIMIT 1
  ) funding ON true
  WHERE a.state='ACTIVE' AND a.network=p_network
    AND cardinality(p_invite_codes) BETWEEN 1 AND 100
    AND a.invite_code=ANY(p_invite_codes);
$function$;

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
  v_first_reset bigint;
  v_target bigint;
  v_prev_vote_round bigint;
  v_attempt_no integer;
  v_created_id bigint;
  v_event_id bigint;
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

  IF v_inv.status <> 'ACTIVATING' OR v_inv.reward_status <> 'PENDING' OR
     (v_inv.vote_completed = true AND (NOT v_cfg.two_round_policy_enabled OR v_inv.impact_sync_complete_at IS NOT NULL)) OR v_inv.sybil_status IN('REVIEW','BLOCKED') OR
     v_inv.ineligible_at IS NOT NULL OR v_inv.invitee_wallet IS NULL OR
     v_inv.eligibility_check_id IS NULL OR v_inv.reward_cohort_round_id IS NULL OR
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

  v_first_reset := greatest(v_inv.reward_cohort_round_id + 2,
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
                                v_inv.reward_cohort_round_id) + 1;
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

  RETURN jsonb_build_object(
    'started',true,'attemptNo',v_attempt_no,
    'attemptId',v_created_id,'dappRoundId',v_target,
    'voteRoundId',v_target+1,'notificationId',v_event_id,
    'friendSlotPreserved',true
  );
END;
$function$;

