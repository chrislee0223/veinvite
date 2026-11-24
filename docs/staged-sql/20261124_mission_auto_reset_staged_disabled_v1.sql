-- VeInvite automatic N+2 mission restart: STAGED, DEFAULT DISABLED.
-- This migration extends the existing historical attempt ledger without
-- rewriting invitations, money, Sybil evidence, or invitation slots.
-- Live activation is NOT authorized by this migration.
CREATE TABLE IF NOT EXISTS reward_admission_bridge.mission_auto_reset_settings_v1 (
  id smallint PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  first_automatic_round_id bigint NOT NULL DEFAULT 126 CHECK (first_automatic_round_id >= 126),
  minimum_finality_blocks bigint NOT NULL DEFAULT 12 CHECK (minimum_finality_blocks BETWEEN 12 AND 10000)
);
INSERT INTO reward_admission_bridge.mission_auto_reset_settings_v1
(id, enabled, first_automatic_round_id, minimum_finality_blocks)
VALUES (1, false, 126, 12)
ON CONFLICT (id) DO NOTHING;
REVOKE ALL ON reward_admission_bridge.mission_auto_reset_settings_v1 FROM PUBLIC, anon, authenticated;
ALTER TABLE reward_admission_bridge.mission_auto_reset_settings_v1 ENABLE ROW LEVEL SECURITY;

-- Read-only internal capability gate. Both this DB flag and the server's
-- VEINVITE_MISSION_AUTO_RESET_READY must be enabled for a worker to act.
CREATE OR REPLACE FUNCTION public.read_mission_auto_reset_settings_v1()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, public, reward_admission_bridge
AS $settings$
  SELECT jsonb_build_object(
    'enabled',s.enabled,
    'firstAutomaticRoundId',s.first_automatic_round_id,
    'minimumFinalityBlocks',s.minimum_finality_blocks
  )
  FROM reward_admission_bridge.mission_auto_reset_settings_v1 s WHERE s.id=1;
$settings$;
REVOKE ALL ON FUNCTION public.read_mission_auto_reset_settings_v1()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_mission_auto_reset_settings_v1()
  TO service_role;

-- Per-attempt evidence must not reuse the one-reward-per-app legacy table.
CREATE TABLE IF NOT EXISTS reward_admission_bridge.mission_retry_attempt_events_v1 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id bigint NOT NULL REFERENCES reward_admission_bridge.mission_retry_attempts_v1(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')),
  app_id text,
  amount_wei text,
  vote_round_id bigint,
  tx_id text NOT NULL CHECK (tx_id ~ '^0x[0-9a-f]{64}$'),
  block_number bigint NOT NULL CHECK (block_number > 0),
  tx_index integer NOT NULL CHECK (tx_index >= 0),
  clause_index integer NOT NULL CHECK (clause_index >= 0),
  block_timestamp timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT mission_attempt_event_shape_v1 CHECK (
    (event_type='DAPP_REWARD' AND app_id ~ '^0x[0-9a-f]{64}$'
     AND amount_wei ~ '^[0-9]+$' AND amount_wei::numeric > 0 AND vote_round_id IS NULL)
    OR (event_type='VOT3_CONVERSION' AND app_id IS NULL
     AND amount_wei ~ '^[0-9]+$' AND amount_wei::numeric > 0 AND vote_round_id IS NULL)
    OR (event_type='ALLOCATION_VOTE' AND app_id IS NULL
     AND amount_wei IS NULL AND vote_round_id IS NOT NULL AND vote_round_id > 0)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS mission_attempt_one_dapp_per_app_v1
  ON reward_admission_bridge.mission_retry_attempt_events_v1(attempt_id,app_id)
  WHERE event_type='DAPP_REWARD';
CREATE UNIQUE INDEX IF NOT EXISTS mission_attempt_one_conversion_v1
  ON reward_admission_bridge.mission_retry_attempt_events_v1(attempt_id)
  WHERE event_type='VOT3_CONVERSION';
CREATE UNIQUE INDEX IF NOT EXISTS mission_attempt_one_vote_v1
  ON reward_admission_bridge.mission_retry_attempt_events_v1(attempt_id)
  WHERE event_type='ALLOCATION_VOTE';
CREATE INDEX IF NOT EXISTS mission_attempt_event_chain_position_v1
  ON reward_admission_bridge.mission_retry_attempt_events_v1
  (attempt_id,block_number,tx_index,clause_index);
REVOKE ALL ON reward_admission_bridge.mission_retry_attempt_events_v1
  FROM PUBLIC,anon,authenticated;
ALTER TABLE reward_admission_bridge.mission_retry_attempt_events_v1
  ENABLE ROW LEVEL SECURITY;

-- Keep per-attempt events immutable and strictly ordered. Unlike the legacy
-- invite_impact_events table, the same dApp can qualify in a *later* attempt,
-- but it can never be recredited within one attempt or outside the dApp window.
-- A separate chain-aware worker must still independently validate every event.
CREATE OR REPLACE FUNCTION public.validate_mission_attempt_event_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public, reward_admission_bridge
AS $proof$
DECLARE
  a reward_admission_bridge.mission_retry_attempts_v1%rowtype;
  first_dapp record;
  conversion record;
  dapp_count integer;
BEGIN
  IF tg_op <> 'INSERT' THEN
    RAISE EXCEPTION 'MISSION_ATTEMPT_EVENTS_IMMUTABLE';
  END IF;
  SELECT * INTO a FROM reward_admission_bridge.mission_retry_attempts_v1
  WHERE id=new.attempt_id FOR SHARE;
  IF NOT FOUND OR a.state='FINISHED' THEN
    RAISE EXCEPTION 'MISSION_ATTEMPT_EVENT_STATE_INVALID';
  END IF;
  IF new.block_number<a.attempt_start_block THEN
    RAISE EXCEPTION 'MISSION_ATTEMPT_EVENT_BEFORE_RESET';
  END IF;
  IF new.event_type='DAPP_REWARD' THEN
    IF new.block_number>a.round_end_block THEN
      RAISE EXCEPTION 'MISSION_ATTEMPT_DAPP_OUTSIDE_ROUND';
    END IF;
  ELSIF new.event_type='VOT3_CONVERSION' THEN
    SELECT e.block_number,e.tx_index,e.clause_index INTO first_dapp
    FROM reward_admission_bridge.mission_retry_attempt_events_v1 e
    WHERE e.attempt_id=a.id AND e.event_type='DAPP_REWARD'
    ORDER BY e.block_number,e.tx_index,e.clause_index LIMIT 1;
    IF NOT FOUND OR
       (new.block_number,new.tx_index,new.clause_index) <=
       (first_dapp.block_number,first_dapp.tx_index,first_dapp.clause_index) THEN
      RAISE EXCEPTION 'MISSION_ATTEMPT_CONVERSION_BEFORE_DAPP';
    END IF;
  ELSIF new.event_type='ALLOCATION_VOTE' THEN
    IF new.vote_round_id<>a.vote_round_id OR
       new.block_number<=a.round_end_block THEN
      RAISE EXCEPTION 'MISSION_ATTEMPT_VOTE_WRONG_ROUND';
    END IF;
    SELECT count(*) INTO dapp_count
    FROM reward_admission_bridge.mission_retry_attempt_events_v1 e
    WHERE e.attempt_id=a.id AND e.event_type='DAPP_REWARD';
    SELECT e.block_number,e.tx_index,e.clause_index INTO conversion
    FROM reward_admission_bridge.mission_retry_attempt_events_v1 e
    WHERE e.attempt_id=a.id AND e.event_type='VOT3_CONVERSION'
    LIMIT 1;
    IF dapp_count<3 THEN
      RAISE EXCEPTION 'MISSION_ATTEMPT_VOTE_MISSING_DAPPS';
    END IF;
    IF conversion.block_number IS NULL THEN
      RAISE EXCEPTION 'MISSION_ATTEMPT_VOTE_MISSING_CONVERSION';
    END IF;
    IF (new.block_number,new.tx_index,new.clause_index) <=
       (conversion.block_number,conversion.tx_index,conversion.clause_index) THEN
      RAISE EXCEPTION 'MISSION_ATTEMPT_VOTE_BEFORE_CONVERSION';
    END IF;
  END IF;
  RETURN new;
END;
$proof$;
CREATE TRIGGER mission_attempt_event_insert_validator_v1
BEFORE INSERT OR UPDATE OR DELETE
ON reward_admission_bridge.mission_retry_attempt_events_v1
FOR EACH ROW EXECUTE FUNCTION public.validate_mission_attempt_event_v1();
REVOKE ALL ON FUNCTION public.validate_mission_attempt_event_v1()
  FROM PUBLIC,anon,authenticated;

-- Reuse the existing notification type/presentation with distinct lifecycle
-- semantics. The existing history is append-only and unique by dedupe_key.
ALTER TABLE public.invite_notification_history
  DROP CONSTRAINT IF EXISTS invite_notification_history_kind_check;
ALTER TABLE public.invite_notification_history
  ADD CONSTRAINT invite_notification_history_kind_check CHECK (
    kind IN (
      'INVITE_ACCEPTED','DAPP_PROGRESS','MISSION_PROGRESS_RESET',
      'VOT3_CONVERTED','REWARD_READY','REWARD_PAID',
      'REWARD_ADJUSTED','X_PROMOTION_PAID','INVITE_INELIGIBLE',
      'SECURITY_REVIEW_STARTED','SECURITY_REVIEW_CLEARED',
      'SECURITY_POST_PAYOUT_REVIEW_STARTED',
      'SECURITY_POST_PAYOUT_REVIEW_CLEARED',
      'SECURITY_RESTRICTION_CONFIRMED','SECURITY_INVITER_WATCH',
      'SECURITY_INVITER_HOLD','SECURITY_INVITER_RESTRICTED',
      'SECURITY_INVITER_ACCESS_RESTORED',
      'SECURITY_REFERRAL_INVALIDATED','SECURITY_REFERRAL_RESTORED'
    )
  );

-- A service-role-only, atomically idempotent restart writer.
-- The trusted worker MUST:
--   (1) verify exact target round boundaries via VeChain getRound,
--   (2) reconcile the original invitation under the same external lease,
--   (3) verify NO qualifying previous vote/late proof remains,
--   (4) wait for finalized end of the previous vote window,
--   (5) check identity + Sybil/funding + payout controls before calling this.
-- This function also fails closed if the DB has not observed the latest
-- allocation/round. It never changes the canonical invitation or money.
CREATE OR REPLACE FUNCTION public.commit_invitation_mission_auto_reset_v1(
  p_invite_code text,
  p_network text,
  p_expected_current_round_id bigint,
  p_target_dapp_round_id bigint,
  p_target_round_start_block bigint,
  p_target_round_end_block bigint,
  p_previous_vote_window_end_block bigint,
  p_chain_best_sealed_block bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public, reward_admission_bridge
AS $body$
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
     v_inv.vote_completed = true OR v_inv.sybil_status IN('REVIEW','BLOCKED') OR
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
  IF v_prior.id IS NOT NULL AND EXISTS (
    SELECT 1 FROM reward_admission_bridge.mission_retry_attempt_events_v1 e
    WHERE e.attempt_id=v_prior.id AND e.event_type='ALLOCATION_VOTE'
  ) THEN
    RETURN jsonb_build_object('started',false,'reason','PREVIOUS_ATTEMPT_PROTECTED');
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
$body$;

REVOKE ALL ON FUNCTION public.commit_invitation_mission_auto_reset_v1(
 text,text,bigint,bigint,bigint,bigint,bigint,bigint
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_invitation_mission_auto_reset_v1(
 text,text,bigint,bigint,bigint,bigint,bigint,bigint
) TO service_role;

-- Display/verification state is scoped to the active attempt only. The
-- original invitation's activation and funding binding remain immutable.
ALTER TABLE reward_admission_bridge.mission_retry_attempts_v1
  ADD COLUMN IF NOT EXISTS vote_window_start_block bigint,
  ADD COLUMN IF NOT EXISTS vote_window_end_block bigint,
  ADD COLUMN IF NOT EXISTS proof_finalized_through_block bigint;
ALTER TABLE reward_admission_bridge.mission_retry_attempts_v1
  ADD CONSTRAINT mission_retry_vote_bounds_v1 CHECK (
    (vote_window_start_block IS NULL AND vote_window_end_block IS NULL)
    OR (vote_window_start_block IS NOT NULL AND vote_window_end_block IS NOT NULL
        AND vote_window_start_block>round_end_block
        AND vote_window_end_block>=vote_window_start_block)
  );

-- Internal batched projection used by both authenticated wallets. No
-- arbitrary user inputs or public table exposure; callers validate ownership.
CREATE OR REPLACE FUNCTION public.read_mission_auto_reset_progress_v1(
  p_network text,p_invite_codes text[]
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, public, reward_admission_bridge
AS $projection$
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
$projection$;
REVOKE ALL ON FUNCTION public.read_mission_auto_reset_progress_v1(text,text[])
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_mission_auto_reset_progress_v1(text,text[])
TO service_role;

-- Store only proof events from a server-owned FINALIZED chain scan. A stale
-- scanner must not append to a replaced attempt. Financial settlement remains
-- independently blocked. A valid vote identifies the actual completion round.
CREATE OR REPLACE FUNCTION public.record_mission_auto_reset_progress_v1(
  p_network text,p_invite_code text,p_attempt_no integer,
  p_dapp_round_id bigint,p_start_block bigint,p_dapp_end_block bigint,
  p_vote_start_block bigint,p_vote_end_block bigint,p_finalized_block bigint,
  p_events jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public, reward_admission_bridge
AS $persist$
DECLARE
  a reward_admission_bridge.mission_retry_attempts_v1%rowtype;
  i public.invitations%rowtype;
  e record;
  prior reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
  v_event_count integer;
BEGIN
  IF p_network NOT IN ('mainnet','testnet','testnet-staging')
     OR p_invite_code IS NULL OR p_invite_code !~ '^[A-HJ-NP-Z2-9]{7}$'
     OR p_attempt_no IS NULL OR p_attempt_no<1
     OR p_finalized_block IS NULL OR p_finalized_block<p_start_block
     OR jsonb_typeof(p_events) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_events)>5
  THEN RAISE EXCEPTION 'MISSION_ATTEMPT_SCAN_INPUT_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_auto_reset_settings_v1
     WHERE id=1 AND enabled) THEN
    RETURN jsonb_build_object('recorded',false,'reason','FEATURE_DISABLED');
  END IF;
  SELECT * INTO i FROM public.invitations
    WHERE invite_code=p_invite_code AND activation_network=p_network FOR UPDATE;
  IF NOT FOUND OR i.status NOT IN('ACTIVATING','UNDER_REVIEW')
     OR i.reward_status<>'PENDING' OR i.sybil_status='BLOCKED'
     OR i.ineligible_at IS NOT NULL OR i.slot_released_at IS NOT NULL THEN
    RETURN jsonb_build_object('recorded',false,'reason','INVITE_PROTECTED');
  END IF;
  SELECT * INTO a FROM reward_admission_bridge.mission_retry_attempts_v1
    WHERE invitation_id=i.id AND network=p_network AND state='ACTIVE' FOR UPDATE;
  IF NOT FOUND OR a.attempt_no<>p_attempt_no OR a.dapp_round_id<>p_dapp_round_id
     OR a.attempt_start_block<>p_start_block OR a.round_end_block<>p_dapp_end_block THEN
    RETURN jsonb_build_object('recorded',false,'reason','STALE_ATTEMPT');
  END IF;
  IF (p_vote_start_block IS NULL)<>(p_vote_end_block IS NULL)
     OR (p_vote_start_block IS NOT NULL AND
       (p_vote_start_block<=a.round_end_block OR p_vote_end_block<p_vote_start_block))
     OR (a.vote_window_start_block IS NOT NULL AND
       (p_vote_start_block IS DISTINCT FROM a.vote_window_start_block
        OR p_vote_end_block IS DISTINCT FROM a.vote_window_end_block)) THEN
    RAISE EXCEPTION 'MISSION_ATTEMPT_VOTE_BOUNDS_MISMATCH';
  END IF;
  IF a.proof_finalized_through_block IS NOT NULL AND
     p_finalized_block<a.proof_finalized_through_block THEN
    RETURN jsonb_build_object('recorded',false,'reason','STALE_FINALITY');
  END IF;

  FOR e IN SELECT * FROM jsonb_to_recordset(p_events) AS x(
    event_type text,app_id text,amount_wei text,vote_round_id bigint,
    tx_id text,block_number bigint,tx_index integer,clause_index integer,
    block_timestamp timestamptz
  ) ORDER BY CASE event_type WHEN 'DAPP_REWARD' THEN 1
       WHEN 'VOT3_CONVERSION' THEN 2 WHEN 'ALLOCATION_VOTE' THEN 3 ELSE 4 END,
       block_number,tx_index,clause_index
  LOOP
    IF e.block_number IS NULL OR e.block_number>p_finalized_block
       OR e.block_number<a.attempt_start_block
       OR e.event_type NOT IN('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
       OR (e.event_type='DAPP_REWARD' AND
          (e.app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
           OR e.block_number>a.round_end_block))
       OR (e.event_type='VOT3_CONVERSION' AND
           e.block_number>coalesce(p_vote_end_block,a.round_end_block))
       OR (e.event_type='ALLOCATION_VOTE' AND
           (p_vote_start_block IS NULL OR e.vote_round_id IS DISTINCT FROM a.vote_round_id
            OR e.block_number NOT BETWEEN p_vote_start_block AND p_vote_end_block))
    THEN RAISE EXCEPTION 'MISSION_ATTEMPT_SCAN_EVENT_INVALID'; END IF;

    SELECT * INTO prior FROM reward_admission_bridge.mission_retry_attempt_events_v1
      WHERE attempt_id=a.id AND event_type=e.event_type
        AND (e.event_type<>'DAPP_REWARD' OR app_id=e.app_id);
    IF FOUND THEN
      IF (prior.app_id,prior.amount_wei,prior.vote_round_id,prior.tx_id,prior.block_number,
          prior.tx_index,prior.clause_index,prior.block_timestamp) IS DISTINCT FROM
         (e.app_id,e.amount_wei,e.vote_round_id,e.tx_id,e.block_number,
          e.tx_index,e.clause_index,e.block_timestamp) THEN
        RAISE EXCEPTION 'MISSION_ATTEMPT_FINALIZED_PROOF_CONFLICT';
      END IF;
      CONTINUE;
    END IF;
    IF e.event_type='DAPP_REWARD' THEN
      SELECT count(*) INTO v_event_count
      FROM reward_admission_bridge.mission_retry_attempt_events_v1
      WHERE attempt_id=a.id AND event_type='DAPP_REWARD';
      IF v_event_count>=3 THEN RAISE EXCEPTION 'MISSION_ATTEMPT_TOO_MANY_DAPPS'; END IF;
    END IF;
    INSERT INTO reward_admission_bridge.mission_retry_attempt_events_v1
      (attempt_id,event_type,app_id,amount_wei,vote_round_id,tx_id,block_number,tx_index,clause_index,block_timestamp)
    VALUES (a.id,e.event_type,e.app_id,e.amount_wei,e.vote_round_id,e.tx_id,
      e.block_number,e.tx_index,e.clause_index,e.block_timestamp);
  END LOOP;
  UPDATE reward_admission_bridge.mission_retry_attempts_v1
  SET vote_window_start_block=p_vote_start_block,vote_window_end_block=p_vote_end_block,
      proof_finalized_through_block=p_finalized_block
  WHERE id=a.id;
  RETURN jsonb_build_object('recorded',true,'attemptNo',a.attempt_no);
END;
$persist$;
REVOKE ALL ON FUNCTION public.record_mission_auto_reset_progress_v1(
  text,text,integer,bigint,bigint,bigint,bigint,bigint,bigint,jsonb
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_mission_auto_reset_progress_v1(
  text,text,integer,bigint,bigint,bigint,bigint,bigint,bigint,jsonb
) TO service_role;

-- Critical protection: the LIVE legacy scanner is append-only and sees old
-- 3/3, conversion and vote evidence from the original activation block.
-- Until the new cohort-aware reservation/claim writer is integrated, it may
-- NOT promote an active retry to COMPLETED or ELIGIBLE based on old evidence.
-- This trigger does not affect any invitation lacking a durable retry.
CREATE OR REPLACE FUNCTION public.guard_legacy_mission_auto_reset_promotion_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public, reward_admission_bridge
AS $guard$
BEGIN
  IF (new.status IS DISTINCT FROM old.status OR
      new.reward_status IS DISTINCT FROM old.reward_status)
     AND (new.status='COMPLETED' OR new.reward_status='ELIGIBLE')
     AND EXISTS (
       SELECT 1
       FROM reward_admission_bridge.mission_retry_attempts_v1 a
       WHERE a.invitation_id=new.id
         AND a.network=new.activation_network
     ) THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_PAYOUT_NOT_ENABLED';
  END IF;
  RETURN new;
END;
$guard$;
DROP TRIGGER IF EXISTS zz_guard_legacy_mission_auto_reset_promotion_v1
  ON public.invitations;
CREATE TRIGGER zz_guard_legacy_mission_auto_reset_promotion_v1
BEFORE UPDATE OF status,reward_status ON public.invitations
FOR EACH ROW
EXECUTE FUNCTION public.guard_legacy_mission_auto_reset_promotion_v1();
REVOKE ALL ON FUNCTION public.guard_legacy_mission_auto_reset_promotion_v1()
FROM PUBLIC,anon,authenticated;


-- Immutable completion/funding handoff. This records the exact qualifying
-- completion and the allocation backing that round, NOT a payout approval.
-- Do not change the initial entry binding or reuse the old vote.
CREATE TABLE reward_admission_bridge.mission_retry_settlement_bindings_v1 (
  attempt_id bigint PRIMARY KEY REFERENCES reward_admission_bridge.mission_retry_attempts_v1(id) ON DELETE RESTRICT,
  invitation_id uuid NOT NULL UNIQUE REFERENCES public.invitations(id) ON DELETE RESTRICT,
  network text NOT NULL CHECK(network IN ('mainnet','testnet','testnet-staging')),
  completion_round_id bigint NOT NULL CHECK(completion_round_id>=127),
  funding_allocation_receipt_id bigint NOT NULL REFERENCES public.vebetter_round_allocations(id) ON DELETE RESTRICT,
  completion_event_id bigint NOT NULL UNIQUE REFERENCES reward_admission_bridge.mission_retry_attempt_events_v1(id) ON DELETE RESTRICT,
  completion_block bigint NOT NULL CHECK(completion_block>0),
  finalized_through_block bigint NOT NULL CHECK(finalized_through_block>=completion_block),
  bound_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE reward_admission_bridge.mission_retry_settlement_bindings_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reward_admission_bridge.mission_retry_settlement_bindings_v1 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bind_mission_retry_completion_v1(
  p_network text,p_invite_code text,p_attempt_no integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $bind$
DECLARE
  i public.invitations%rowtype;
  a reward_admission_bridge.mission_retry_attempts_v1%rowtype;
  v reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
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

  SELECT * INTO b FROM reward_admission_bridge.mission_retry_settlement_bindings_v1
    WHERE invitation_id=i.id;
  IF FOUND THEN
    IF b.attempt_id<>a.id OR b.completion_event_id<>v.id THEN
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
  VALUES (a.id,i.id,p_network,a.vote_round_id,f.id,v.id,v.block_number,a.proof_finalized_through_block);
  RETURN jsonb_build_object('bound',true,'completionRoundId',a.vote_round_id,
    'fundingAllocationReceiptId',f.id::text);
END;
$bind$;
REVOKE ALL ON FUNCTION public.bind_mission_retry_completion_v1(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bind_mission_retry_completion_v1(text,text,integer) TO service_role;

-- Canonical financial context for every settlement consumer. An unbound retry
-- MUST return null funding, never fall back to the original entry cohort.
-- This view has no financial side effects. Retain finished-attempt bindings
-- so historical liabilities and X-share releases stay attributed correctly.
CREATE VIEW reward_admission_bridge.mission_effective_reward_funding_v1
WITH (security_invoker=true) AS
SELECT i.id invitation_id,i.invite_code,i.activation_network network,
  CASE WHEN a.id IS NULL THEN i.reward_cohort_round_id
       ELSE b.completion_round_id END AS reward_cohort_round_id,
  CASE WHEN a.id IS NULL THEN i.reward_funding_allocation_receipt_id
       ELSE b.funding_allocation_receipt_id END AS reward_funding_allocation_receipt_id,
  a.id AS attempt_id,
  b.completion_event_id,
  b.completion_block,
  e.tx_index AS completion_tx_index,
  e.clause_index AS completion_clause_index,
  e.tx_id AS completion_tx_id
FROM public.invitations i
LEFT JOIN LATERAL (
  SELECT m.id FROM reward_admission_bridge.mission_retry_attempts_v1 m
  WHERE m.invitation_id=i.id AND m.network=i.activation_network
  ORDER BY m.attempt_no DESC LIMIT 1
) a ON true
LEFT JOIN reward_admission_bridge.mission_retry_settlement_bindings_v1 b
 ON b.invitation_id=i.id AND b.attempt_id=a.id AND b.network=i.activation_network
LEFT JOIN reward_admission_bridge.mission_retry_attempt_events_v1 e
 ON e.id=b.completion_event_id AND e.attempt_id=a.id;
REVOKE ALL ON reward_admission_bridge.mission_effective_reward_funding_v1
 FROM PUBLIC,anon,authenticated;

-- Service-owned consumers use this narrow accessor, without changing the
-- original invitation row. Neither an absent binding nor a stale attempt is
-- allowed to become a legacy-funded retry.
CREATE OR REPLACE FUNCTION public.read_effective_mission_reward_funding_v1(
 p_invite_code text,p_network text
) RETURNS TABLE(reward_cohort_round_id bigint,reward_funding_allocation_receipt_id bigint,
 attempt_id bigint,completion_block bigint,completion_tx_index integer,
 completion_clause_index integer,completion_tx_id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $fund$
 SELECT v.reward_cohort_round_id,v.reward_funding_allocation_receipt_id,
   v.attempt_id,v.completion_block,v.completion_tx_index,v.completion_clause_index,v.completion_tx_id
 FROM reward_admission_bridge.mission_effective_reward_funding_v1 v
 WHERE v.invite_code=p_invite_code AND v.network=p_network;
$fund$;
REVOKE ALL ON FUNCTION public.read_effective_mission_reward_funding_v1(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_effective_mission_reward_funding_v1(text,text) TO service_role;
