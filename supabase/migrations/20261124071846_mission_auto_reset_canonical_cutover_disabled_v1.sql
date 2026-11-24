-- Reviewed disabled cutover; runtime activation is separate.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $preflight$ BEGIN
 IF to_regclass('reward_admission_bridge.mission_auto_reset_settings_v1') IS NOT NULL OR EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1) THEN RAISE EXCEPTION 'UNEXPECTED_EXISTING_RESET_STATE'; END IF;
 IF md5(pg_get_functiondef('public.acknowledge_invite_notification_history(text,bigint[],bigint)'::regprocedure)) IS DISTINCT FROM '48f04effce267c998625d8b8ba1240db' THEN RAISE EXCEPTION 'ACK_SOURCE_CHANGED'; END IF;
END; $preflight$;
-- Reviewed source: 20261124_mission_auto_reset_staged_disabled_v1.sql
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
    (event_type='DAPP_REWARD' AND app_id IS NOT NULL AND amount_wei IS NOT NULL AND app_id ~ '^0x[0-9a-f]{64}$'
     AND amount_wei ~ '^[0-9]+$' AND amount_wei::numeric > 0 AND vote_round_id IS NULL)
    OR (event_type='VOT3_CONVERSION' AND app_id IS NULL AND amount_wei IS NOT NULL
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
BEFORE UPDATE ON public.invitations
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

-- Reviewed source: 20261124_mission_reset_invitee_ack_v1.sql
-- The new reset alert is invitee-only and is a history event, not
-- an inviter-owned referral milestone. It must not advance the inviter's
-- highest_stage or its dApp progress acknowledgement.
-- Preserve the entire existing ACK body except this single guard.
DO $guard$
DECLARE prior text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO prior FROM pg_proc p
  WHERE p.proname='acknowledge_invite_notification_history'
    AND p.pronamespace='public'::regnamespace LIMIT 1;
  IF prior IS NOT NULL
    AND prior NOT LIKE '%v_row.kind <> ''X_PROMOTION_PAID'' then%'
    AND prior NOT LIKE '%v_row.kind <> ''MISSION_PROGRESS_RESET'' then%' THEN
    RAISE EXCEPTION 'INVITE_NOTIFICATION_ACK_VERSION_REVIEW_REQUIRED';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.acknowledge_invite_notification_history(p_inviter_wallet text, p_ids bigint[] DEFAULT NULL::bigint[], p_through_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_row public.invite_notification_history%rowtype;
  v_count integer := 0;
  v_stage integer;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid notification wallet';
  end if;

  if (p_ids is null and p_through_id is null)
     or (p_ids is not null and p_through_id is not null) then
    raise exception 'choose ids or through id';
  end if;

  if p_ids is not null then
    if cardinality(p_ids) < 1 or cardinality(p_ids) > 100 then
      raise exception 'invalid notification id count';
    end if;
  elsif p_through_id is null or p_through_id < 1 then
    raise exception 'invalid through id';
  end if;

  for v_row in
    select h.*
    from public.invite_notification_history h
    where coalesce(h.recipient_wallet, h.inviter_wallet) = v_wallet
    -- Operator-cleared, older preclaim review is closed; no user-read mutation.
    and not (
      h.kind = 'SECURITY_REVIEW_STARTED'
      and h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-r%'
      and coalesce(h.recipient_wallet, h.inviter_wallet) = h.inviter_wallet
      and exists (
        select 1
        from public.sybil_v2_referral_assessments resolved_review
        join public.invitations inv on inv.invite_code = resolved_review.invite_code
        where resolved_review.invite_code = h.invite_code
          and resolved_review.state = 'CLEAR'
          and resolved_review.updated_at >= h.event_at
          and resolved_review.reason_codes @> '["OPERATOR_CLEARED"]'::jsonb
          and inv.inviter_wallet = h.inviter_wallet
          and inv.sybil_status <> 'BLOCKED'
          and inv.reward_status <> 'FORFEITED'
          and not exists (
            select 1 from public.sybil_v2_wallet_restrictions block
            where block.related_invite_code = h.invite_code
              and block.status = 'ACTIVE'
          )
          and not exists (
            select 1 from public.invite_notification_history later
            where later.invite_code = h.invite_code
              and later.id > h.id
              and later.kind = 'SECURITY_REVIEW_STARTED'
          )
      )
    )
    -- Ignore only past security-review / inviter-hold notices for a finalized
    -- blocked-and-forfeited invitation with a released slot.
    and not (
      h.kind in ('SECURITY_REVIEW_STARTED', 'SECURITY_INVITER_HOLD')
      and (
        (h.kind = 'SECURITY_INVITER_HOLD')
        or (
          h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-%'
          and coalesce(h.recipient_wallet, h.inviter_wallet) = h.inviter_wallet
        )
      )
      and exists (
        select 1
        from public.invitations terminal_invite
        where terminal_invite.invite_code = h.invite_code
          and terminal_invite.inviter_wallet = h.inviter_wallet
          and terminal_invite.status = 'CANCELLED'
          and terminal_invite.sybil_status = 'BLOCKED'
          and terminal_invite.reward_status = 'FORFEITED'
          and terminal_invite.slot_released_at is not null
      )
    )
    -- Terminal security outcomes supersede earlier progress / review notices.
    -- Leave audit/history rows and real read receipts untouched.
    and not (exists (
      select 1
      from public.invite_notification_history final_outcome
      where final_outcome.invite_code = h.invite_code
        and coalesce(final_outcome.recipient_wallet, final_outcome.inviter_wallet)
            = coalesce(h.recipient_wallet, h.inviter_wallet)
        and final_outcome.id > h.id
        and final_outcome.event_at >= h.event_at
        and (
          (h.kind = 'SECURITY_REVIEW_STARTED'
            and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED', 'SECURITY_REFERRAL_INVALIDATED'))
          or (h.kind = 'SECURITY_POST_PAYOUT_REVIEW_STARTED'
            and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_POST_PAYOUT_REVIEW_CLEARED'))
          or (h.kind = 'SECURITY_REVIEW_STARTED'
AND h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:postpayout-r%'
AND final_outcome.kind = 'SECURITY_INVITER_ACCESS_RESTORED'
AND final_outcome.dedupe_key like 'security-v2:%:SECURITY_INVITER_ACCESS_RESTORED:postpayout-clear-r%')
          or (h.kind = 'SECURITY_INVITER_HOLD'
            and final_outcome.kind in ('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED', 'SECURITY_REFERRAL_INVALIDATED'))
          or (h.kind in ('INVITE_ACCEPTED', 'DAPP_PROGRESS', 'VOT3_CONVERTED', 'REWARD_READY')
            and final_outcome.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REFERRAL_INVALIDATED', 'REWARD_PAID'))
        )
    ))
    -- One blacklist outcome per recipient: retain append-only history while
    -- masking a generic ineligible event generated for the same decision.
    and not (
      h.kind = 'INVITE_INELIGIBLE'
      and exists (
        select 1
        from public.invite_notification_history security_outcome
        where security_outcome.invite_code = h.invite_code
          and security_outcome.kind = 'SECURITY_RESTRICTION_CONFIRMED'
          and coalesce(security_outcome.recipient_wallet, security_outcome.inviter_wallet)
              = coalesce(h.recipient_wallet, h.inviter_wallet)
          and h.event_at between security_outcome.event_at - interval '10 minutes'
                             and security_outcome.event_at + interval '10 minutes'
      )
    )
    and (
      h.kind not in ('SECURITY_REVIEW_STARTED', 'SECURITY_POST_PAYOUT_REVIEW_STARTED', 'SECURITY_INVITER_HOLD')
      or h.event_at <= clock_timestamp() - interval '10 seconds'
    )
      and (
        (p_ids is not null and h.id = any(p_ids))
        or (
          p_through_id is not null
          and h.id <= p_through_id
          and h.kind <> 'REWARD_PAID'
        )
      )
      and not exists (
        select 1
        from public.invite_notification_history_reads r
        where r.notification_id = h.id
      )
      and not (
        h.kind = 'SECURITY_REVIEW_STARTED'
        and exists (
          select 1
          from public.invite_notification_history later
          where coalesce(later.recipient_wallet, later.inviter_wallet)
                = coalesce(h.recipient_wallet, h.inviter_wallet)
            and later.invite_code = h.invite_code
            and later.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED')
            and later.event_at >= h.event_at
            and later.event_at <= h.event_at + interval '10 seconds'
        )
      )
      and not (
        h.kind = 'SECURITY_POST_PAYOUT_REVIEW_STARTED'
        and exists (
          select 1
          from public.invite_notification_history later
          where coalesce(later.recipient_wallet, later.inviter_wallet)
                = coalesce(h.recipient_wallet, h.inviter_wallet)
            and later.invite_code = h.invite_code
            and later.kind in ('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_POST_PAYOUT_REVIEW_CLEARED')
            and later.event_at >= h.event_at
            and later.event_at <= h.event_at + interval '10 seconds'
        )
      )
      and not (
        h.kind = 'SECURITY_INVITER_HOLD'
        and exists (
          select 1
          from public.invite_notification_history later
          where coalesce(later.recipient_wallet, later.inviter_wallet)
                = coalesce(h.recipient_wallet, h.inviter_wallet)
            and later.invite_code = h.invite_code
            and later.kind in ('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED')
            and later.event_at >= h.event_at
            and later.event_at <= h.event_at + interval '10 seconds'
        )
      )
    order by h.id
  loop
    insert into public.invite_notification_history_reads(
      notification_id,
      inviter_wallet,
      read_at
    ) values (
      v_row.id,
      v_wallet,
      now()
    )
    on conflict (notification_id) do nothing;

    if found then
      -- X promotion paid uses its own durable history read row and must
      -- not advance the legacy referral lifecycle stage. Advancing stage 5
      -- here could indirectly suppress an unread core REWARD_PAID notice.
      if v_row.kind not like 'SECURITY_%'
         and v_row.kind <> 'X_PROMOTION_PAID'
         and v_row.kind <> 'MISSION_PROGRESS_RESET' then
        v_stage := case
          when v_row.kind = 'DAPP_PROGRESS'
            and coalesce(v_row.dapp_progress, 0) < 3
          then null
          else v_row.stage
        end;

        perform public.acknowledge_invite_notification_v2(
          v_row.invite_code,
          v_wallet,
          v_stage,
          v_row.dapp_progress,
          v_row.kind = 'REWARD_READY'
        );
      end if;

      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object('acknowledged', v_count);
end;
$function$;

-- Reviewed source: 20261124_mission_retry_canonical_checkpoint_adapters_v1.sql
-- STAGED ONLY. Publish a fully verified retry's canonical completion
-- checkpoint so existing security machinery sees the NEW vote, not the
-- original invite's vote. No eligibility, reservation or payment approval.
-- Run in the same reviewed cutover transaction as the financial adapters.

DO $source_guard$
BEGIN
  IF md5(pg_get_functiondef('public.enforce_invitation_execution_order()'::regprocedure)) IS DISTINCT FROM '852c2935791560441dae5d4e57f775e8' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CHECKPOINT_SOURCE_CHANGED: enforce_invitation_execution_order()';
  END IF;
  IF md5(pg_get_functiondef('public.sync_invitation_reward_eligibility()'::regprocedure)) IS DISTINCT FROM 'c7119e5b9be1bc29f56941a8222df34c' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CHECKPOINT_SOURCE_CHANGED: sync_invitation_reward_eligibility()';
  END IF;
END;
$source_guard$;

-- Only the current bound attempt may provide completion proof to the
-- canonical eligibility validators. Historical events remain intact for
-- fraud/forensics. Non-retry invitations keep their original event behavior.
CREATE OR REPLACE FUNCTION public.read_mission_effective_proof_events_v1(
 p_invite_code text,p_network text
) RETURNS TABLE(invite_code text,network text,wallet_address text,event_type text,
 tx_id text,block_number bigint,block_timestamp timestamptz,app_id text,
 vote_round_id bigint,amount_wei text,tx_index bigint,clause_index bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $events$
 WITH latest AS (
   SELECT a.id,a.invitation_id,a.network,a.invite_code
   FROM reward_admission_bridge.mission_retry_attempts_v1 a
   WHERE a.invite_code=p_invite_code AND a.network=p_network
   ORDER BY a.attempt_no DESC LIMIT 1
 )
 SELECT e.invite_code,e.network,e.wallet_address,e.event_type,e.tx_id,
   e.block_number,e.block_timestamp,e.app_id,e.vote_round_id,e.amount_wei,
   e.tx_index,e.clause_index
 FROM public.invite_impact_events e
 WHERE e.invite_code=p_invite_code AND e.network=p_network
   AND NOT EXISTS(SELECT 1 FROM latest)
 UNION ALL
 SELECT a.invite_code,a.network,lower(i.invitee_wallet),e.event_type,e.tx_id,
   e.block_number,e.block_timestamp,e.app_id,e.vote_round_id,e.amount_wei,
   e.tx_index::bigint,e.clause_index::bigint
 FROM latest a
 JOIN public.invitations i ON i.id=a.invitation_id AND i.invite_code=a.invite_code
    AND i.activation_network=a.network
 JOIN reward_admission_bridge.mission_retry_settlement_bindings_v1 b
    ON b.attempt_id=a.id AND b.invitation_id=i.id AND b.network=a.network
 JOIN reward_admission_bridge.mission_retry_attempt_events_v1 e ON e.attempt_id=a.id
 WHERE e.block_number<=b.finalized_through_block;
$events$;
REVOKE ALL ON FUNCTION public.read_mission_effective_proof_events_v1(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_mission_effective_proof_events_v1(text,text)
 TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_invitation_execution_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_order_is_valid boolean := false;
begin
  if new.reward_status <> 'ELIGIBLE' then
    return new;
  end if;

  if new.invitee_wallet is null
     or new.activation_network is null
     or new.activation_block is null
     or new.vot3_conversion_tx_id is null
     or new.vot3_converted_block is null
     or new.vot3_converted_at is null
     or new.vot3_conversion_amount_wei is null
     or new.vote_completed_block is null
     or new.vote_completed_at is null
     or new.vote_round_id is null then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
    return new;
  end if;

  select exists(
    select 1
    from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) c
    where c.invite_code = new.invite_code
      and c.network = new.activation_network
      and c.wallet_address = lower(new.invitee_wallet)
      and c.event_type = 'VOT3_CONVERSION'
      and c.tx_id = new.vot3_conversion_tx_id
      and c.block_number = new.vot3_converted_block
      and c.block_timestamp = new.vot3_converted_at
      and c.amount_wei = new.vot3_conversion_amount_wei
      and c.tx_index is not null
      and c.clause_index is not null
      and exists(
        select 1
        from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) r
        where r.invite_code = new.invite_code
          and r.network = new.activation_network
          and r.wallet_address = lower(new.invitee_wallet)
          and r.event_type = 'DAPP_REWARD'
          and r.block_number >= new.activation_block
          and r.tx_index is not null
          and r.clause_index is not null
          and (
            r.block_number < c.block_number
            or (
              r.block_number = c.block_number
              and (
                r.tx_index < c.tx_index
                or (
                  r.tx_index = c.tx_index
                  and r.clause_index < c.clause_index
                )
              )
            )
          )
      )
      and exists(
        select 1
        from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) v
        where v.invite_code = new.invite_code
          and v.network = new.activation_network
          and v.wallet_address = lower(new.invitee_wallet)
          and v.event_type = 'ALLOCATION_VOTE'
          and v.block_number = new.vote_completed_block
          and v.block_timestamp = new.vote_completed_at
          and v.vote_round_id = new.vote_round_id
          and v.tx_index is not null
          and v.clause_index is not null
          and (
            c.block_number < v.block_number
            or (
              c.block_number = v.block_number
              and (
                c.tx_index < v.tx_index
                or (
                  c.tx_index = v.tx_index
                  and c.clause_index < v.clause_index
                )
              )
            )
          )
      )
  ) into v_order_is_valid;

  if not v_order_is_valid then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_invitation_reward_eligibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_has_paid_payout boolean := false;
  v_has_eligible_entry_check boolean := false;
  v_has_three_reward_events boolean := false;
  v_has_third_app_checkpoint boolean := false;
  v_has_conversion_event boolean := false;
  v_has_vote_event boolean := false;
begin
  select exists(
    select 1
    from public.reward_payouts rp
    where rp.invite_code = new.invite_code
      and rp.status = 'PAID'
      and rp.tx_id is not null
      and rp.paid_at is not null
  ) into v_has_paid_payout;

  if v_has_paid_payout then
    new.reward_status := 'PAID';
    if new.reward_paid_at is null then
      select rp.paid_at
      into new.reward_paid_at
      from public.reward_payouts rp
      where rp.invite_code = new.invite_code
        and rp.status = 'PAID'
      order by rp.paid_at desc
      limit 1;
    end if;
    return new;
  end if;

  new.reward_paid_at := null;

  if new.status = 'CANCELLED' or new.sybil_status = 'BLOCKED' then
    new.reward_status := 'FORFEITED';
    new.reward_eligible_at := null;
    return new;
  end if;

  if new.invitee_wallet is null
     or new.activation_block is null
     or new.activation_network is null
     or coalesce(new.apps_completed, 0) < 3
     or new.apps_completed_at is null
     or new.apps_completed_block is null
     or new.apps_completed_block < new.activation_block then
    new.apps_completed_at := null;
    new.apps_completed_block := null;
  end if;

  if coalesce(new.vot3_converted, false) = false
     or new.invitee_wallet is null
     or new.activation_block is null
     or new.activation_network is null
     or new.vot3_converted_at is null
     or new.vot3_converted_block is null
     or new.vot3_conversion_tx_id is null
     or new.vot3_conversion_amount_wei is null
     or new.vot3_converted_block < new.activation_block
     or new.vot3_conversion_tx_id !~ '^0x[0-9a-f]{64}$'
     or new.vot3_conversion_amount_wei !~ '^[0-9]+$'
     or new.vot3_conversion_amount_wei::numeric <= 0 then
    new.vot3_converted := false;
    new.vot3_converted_at := null;
    new.vot3_converted_block := null;
    new.vot3_conversion_tx_id := null;
    new.vot3_conversion_amount_wei := null;
    new.vote_completed := false;
    new.vote_completed_at := null;
    new.vote_completed_block := null;
    new.vote_round_id := null;
  else
    if coalesce(new.vote_completed, false) = false
       or new.vote_completed_at is null
       or new.vote_completed_block is null
       or new.vote_round_id is null
       or new.vote_completed_block < new.vot3_converted_block then
      new.vote_completed := false;
      new.vote_completed_at := null;
      new.vote_completed_block := null;
      new.vote_round_id := null;
    end if;
  end if;

  if new.eligibility_check_id is not null
     and new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null then
    select exists(
      select 1
      from public.eligibility_check_events e
      where e.id = new.eligibility_check_id
        and e.invite_code = new.invite_code
        and e.wallet_address = lower(new.invitee_wallet)
        and e.network = new.activation_network
        and e.outcome = 'ELIGIBLE'
        and e.entry_class in ('NEW', 'RETURNING')
        and e.checked_block <= new.activation_block
    ) into v_has_eligible_entry_check;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null
     and new.apps_completed_at is not null
     and new.apps_completed_block is not null then
    select count(distinct e.app_id) >= 3
    into v_has_three_reward_events
    from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) e
    where e.invite_code = new.invite_code
      and e.network = new.activation_network
      and e.wallet_address = lower(new.invitee_wallet)
      and e.event_type = 'DAPP_REWARD'
      and e.block_number >= new.activation_block
      and e.block_number <= new.apps_completed_block;

    select exists(
      select 1
      from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) e
      where e.invite_code = new.invite_code
        and e.network = new.activation_network
        and e.wallet_address = lower(new.invitee_wallet)
        and e.event_type = 'DAPP_REWARD'
        and e.block_number = new.apps_completed_block
        and e.block_timestamp = new.apps_completed_at
    ) into v_has_third_app_checkpoint;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null
     and new.vot3_converted = true
     and new.vot3_converted_at is not null
     and new.vot3_converted_block is not null
     and new.vot3_conversion_tx_id is not null
     and new.vot3_conversion_amount_wei is not null then
    select exists(
      select 1
      from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) c
      where c.invite_code = new.invite_code
        and c.network = new.activation_network
        and c.wallet_address = lower(new.invitee_wallet)
        and c.event_type = 'VOT3_CONVERSION'
        and c.tx_id = new.vot3_conversion_tx_id
        and c.block_number = new.vot3_converted_block
        and c.block_timestamp = new.vot3_converted_at
        and c.amount_wei = new.vot3_conversion_amount_wei
        and c.amount_wei ~ '^[0-9]+$'
        and c.amount_wei::numeric > 0
        and exists(
          select 1
          from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) r
          where r.invite_code = new.invite_code
            and r.network = new.activation_network
            and r.wallet_address = lower(new.invitee_wallet)
            and r.event_type = 'DAPP_REWARD'
            and r.block_number >= new.activation_block
            and r.block_number <= c.block_number
        )
    ) into v_has_conversion_event;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.vot3_converted_block is not null
     and new.vote_completed_at is not null
     and new.vote_completed_block is not null
     and new.vote_round_id is not null then
    select exists(
      select 1
      from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) e
      where e.invite_code = new.invite_code
        and e.network = new.activation_network
        and e.wallet_address = lower(new.invitee_wallet)
        and e.event_type = 'ALLOCATION_VOTE'
        and e.block_number = new.vote_completed_block
        and e.block_timestamp = new.vote_completed_at
        and e.vote_round_id = new.vote_round_id
        and e.block_number >= new.vot3_converted_block
    ) into v_has_vote_event;
  end if;

  if new.status = 'COMPLETED'
     and v_has_eligible_entry_check
     and v_has_three_reward_events
     and v_has_third_app_checkpoint
     and v_has_conversion_event
     and v_has_vote_event
     and new.impact_sync_complete_at is not null
     and new.invitee_wallet is not null
     and new.activation_block is not null
     and new.activation_network is not null
     and coalesce(new.apps_completed, 0) >= 3
     and new.apps_completed_at is not null
     and new.apps_completed_block is not null
     and new.apps_completed_block >= new.activation_block
     and new.vot3_converted = true
     and new.vot3_converted_at is not null
     and new.vot3_converted_block is not null
     and new.vot3_converted_block >= new.activation_block
     and new.vot3_conversion_tx_id is not null
     and new.vot3_conversion_amount_wei is not null
     and new.vot3_conversion_amount_wei::numeric > 0
     and coalesce(new.vote_completed, false) = true
     and new.vote_completed_at is not null
     and new.vote_completed_block is not null
     and new.vote_round_id is not null
     and new.vote_completed_block >= new.vot3_converted_block
     and new.sybil_status = 'CLEAR'
     and new.sybil_checked_at is not null
     and new.sybil_checked_at >= new.vote_completed_at then
    new.reward_status := 'ELIGIBLE';
    new.reward_eligible_at := coalesce(
      new.reward_eligible_at,
      new.impact_sync_complete_at,
      new.sybil_checked_at,
      new.vote_completed_at,
      now()
    );
  elsif new.invitee_wallet is not null then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
  else
    new.reward_status := 'NONE';
    new.reward_eligible_at := null;
  end if;

  return new;
end;
$function$;

-- This is a canonical CHECKPOINT only. It deliberately leaves the
-- invitation in ACTIVATING/UNDER_REVIEW with PENDING rewards.
CREATE OR REPLACE FUNCTION public.publish_mission_retry_completion_checkpoint_v1(
 p_network text,p_invite_code text,p_attempt_no integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $publish$
DECLARE
 i public.invitations%rowtype;
 a reward_admission_bridge.mission_retry_attempts_v1%rowtype;
 b reward_admission_bridge.mission_retry_settlement_bindings_v1%rowtype;
 d reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
 c reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
 v reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
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
   WHERE id=b.completion_event_id AND attempt_id=a.id AND event_type='ALLOCATION_VOTE';
 IF d.id IS NULL OR c.id IS NULL OR v.id IS NULL
   OR (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempt_events_v1
      WHERE attempt_id=a.id AND event_type='DAPP_REWARD')<>3
   OR v.block_number<>b.completion_block
   OR v.vote_round_id IS DISTINCT FROM b.completion_round_id
   OR v.block_number>b.finalized_through_block
   OR d.block_number NOT BETWEEN a.attempt_start_block AND a.round_end_block
   OR (v.block_number,v.tx_index,v.clause_index)<=(c.block_number,c.tx_index,c.clause_index)
   OR (v.block_number,v.tx_index,v.clause_index)<=(d.block_number,d.tx_index,d.clause_index)
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
$publish$;
REVOKE ALL ON FUNCTION public.publish_mission_retry_completion_checkpoint_v1(text,text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_mission_retry_completion_checkpoint_v1(text,text,integer)
 TO service_role;

-- Reviewed source: 20261124_mission_retry_sybil_behavior_v1.sql
-- Staged only: maintain original Sybil evidence and include every durable
-- retry's completed dApp pattern. Never replace the original forensic view.
CREATE OR REPLACE FUNCTION public.read_mission_retry_behavior_patterns_v1(
 p_network text
) RETURNS TABLE(invite_code text,inviter_wallet text,invitee_wallet text,
 activated_at timestamptz,app_sequence text[],reward_intervals_seconds bigint[],
 attempt_no integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $behavior$
 WITH ordered AS (
   SELECT a.id,a.invite_code,a.attempt_no,i.inviter_wallet,i.invitee_wallet,
          e.app_id,e.block_timestamp,
          lag(e.block_timestamp) OVER(
            PARTITION BY a.id ORDER BY e.block_number,e.tx_index,e.clause_index,e.id
          ) AS previous_reward_at,
          row_number() OVER(
            PARTITION BY a.id ORDER BY e.block_number,e.tx_index,e.clause_index,e.id
          ) AS reward_order
   FROM reward_admission_bridge.mission_retry_attempts_v1 a
   JOIN public.invitations i ON i.id=a.invitation_id AND i.invite_code=a.invite_code
     AND i.activation_network=a.network
   JOIN reward_admission_bridge.mission_retry_attempt_events_v1 e ON e.attempt_id=a.id
   WHERE a.network=p_network AND e.event_type='DAPP_REWARD'
     AND e.block_number BETWEEN a.attempt_start_block AND a.round_end_block
     AND e.app_id IS NOT NULL
 )
 SELECT o.invite_code,o.inviter_wallet,o.invitee_wallet,min(o.block_timestamp),
   array_agg(o.app_id ORDER BY o.reward_order),
   array_agg(extract(epoch FROM(o.block_timestamp-o.previous_reward_at))::bigint
     ORDER BY o.reward_order) FILTER(WHERE o.previous_reward_at IS NOT NULL),
   o.attempt_no
 FROM ordered o WHERE o.reward_order<=3
 GROUP BY o.id,o.invite_code,o.inviter_wallet,o.invitee_wallet,o.attempt_no
 HAVING count(DISTINCT o.app_id)=3
 ORDER BY o.invite_code,o.attempt_no;
$behavior$;
REVOKE ALL ON FUNCTION public.read_mission_retry_behavior_patterns_v1(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_mission_retry_behavior_patterns_v1(text)
 TO service_role;

-- Reviewed source: 20261124_mission_retry_final_eligibility_v1.sql
-- STAGED: final retry admission, not a new payout mechanism. Apply only
-- together with the checked canonical financial/identity adapters.

CREATE OR REPLACE FUNCTION public.mission_retry_assessment_is_current_v1(
 p_invite_code text,p_network text,p_revision bigint
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $fresh$
 SELECT EXISTS (
  SELECT 1 FROM public.invitations i
  JOIN reward_admission_bridge.mission_retry_attempts_v1 a
    ON a.invitation_id=i.id AND a.network=i.activation_network AND a.state='ACTIVE'
  JOIN reward_admission_bridge.mission_retry_settlement_bindings_v1 b
    ON b.attempt_id=a.id AND b.invitation_id=i.id AND b.network=a.network
  JOIN public.sybil_v2_referral_assessments s ON s.invite_code=i.invite_code AND s.network=a.network
  JOIN reward_admission_bridge.mission_retry_attempt_events_v1 v ON v.id=b.completion_event_id
    AND v.attempt_id=a.id AND v.event_type='ALLOCATION_VOTE'
  WHERE i.invite_code=p_invite_code AND i.activation_network=p_network
    AND s.revision=p_revision AND s.state='CLEAR'
    AND s.evidence_cutoff_block>=b.completion_block
    AND s.assessed_at>=v.block_timestamp
    AND s.evidence_summary->>'missionRetryAttemptNo'=a.attempt_no::text
    AND s.evidence_summary->>'missionRetryCompletionBlock'=b.completion_block::text
    AND '["HISTORICAL_CHAIN","FUNDING_CHAIN","MISSION_BEHAVIOR","SECURITY_IDENTITY","VEPASSPORT","CHAIN_FINALITY"]'::jsonb
       <@ s.completed_checks
    AND s.required_checks<@s.completed_checks
    AND i.vote_completed IS TRUE AND i.vote_round_id=b.completion_round_id
    AND i.vote_completed_block=b.completion_block AND i.vote_completed_at=v.block_timestamp
    AND i.impact_sync_complete_at IS NOT NULL
    AND i.sybil_status NOT IN ('REVIEW','BLOCKED')
    AND i.ineligible_at IS NULL AND i.slot_released_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.sybil_v2_wallet_restrictions k
     WHERE k.network=p_network AND k.status='ACTIVE'
       AND k.wallet_address IN(lower(i.inviter_wallet),lower(i.invitee_wallet)))
 );
$fresh$;
REVOKE ALL ON FUNCTION public.mission_retry_assessment_is_current_v1(text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mission_retry_assessment_is_current_v1(text,text,bigint) TO service_role;

-- The existing trigger remains the independent final guard. Direct updates
-- cannot turn an old/incomplete assessment into eligibility.
CREATE OR REPLACE FUNCTION public.guard_legacy_mission_auto_reset_promotion_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $guard$
DECLARE revision bigint;
BEGIN
 -- Only gate a NEW admission, not a later canonical PAID transition.
 IF ((new.status='COMPLETED' AND old.status IS DISTINCT FROM 'COMPLETED')
      OR (new.reward_status='ELIGIBLE' AND old.reward_status IS DISTINCT FROM 'ELIGIBLE'))
  AND EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1 a
    WHERE a.invitation_id=new.id AND a.network=new.activation_network)
 THEN
   SELECT s.revision INTO revision FROM public.sybil_v2_referral_assessments s
   WHERE s.invite_code=new.invite_code AND s.network=new.activation_network;
   IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_auto_reset_settings_v1 WHERE id=1 AND enabled)
    OR NOT public.sybil_v2_enforcement_enabled()
    OR NOT public.mission_retry_assessment_is_current_v1(new.invite_code,new.activation_network,revision)
    OR new.status IS DISTINCT FROM 'COMPLETED' OR new.reward_status IS DISTINCT FROM 'ELIGIBLE'
    OR new.sybil_status IS DISTINCT FROM 'CLEAR'
    OR NOT coalesce(public.security_identity_v2_observation_complete(new.identity_link_status,
      new.identity_link_checked_at,new.vote_completed_at,new.identity_link_policy_version,
      new.identity_link_evidence),false)
   THEN RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_PAYOUT_NOT_ENABLED'; END IF;
 END IF;
 -- The immutable payout is already reserved and the slot released at this
 -- point. Require its finalized receipt rather than re-running admission.
 -- This remains enforced even if auto-reset is paused after reservation.
 IF new.reward_status='PAID' AND old.reward_status IS DISTINCT FROM 'PAID'
   AND EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1 a
     WHERE a.invitation_id=new.id AND a.network=new.activation_network)
 THEN
   IF NOT EXISTS(
     SELECT 1 FROM public.reward_payouts p
     JOIN public.reward_receipts r ON r.payout_id=p.id AND r.invite_code=p.invite_code
      AND r.recipient_wallet=p.recipient_wallet AND r.tx_id=p.tx_id
      AND r.paid_at=p.paid_at AND r.amount_wei=p.amount_wei
     WHERE p.invite_code=new.invite_code AND p.status='PAID'
       AND p.paid_at IS NOT NULL AND p.tx_id IS NOT NULL
       AND r.network=new.activation_network AND p.recipient_wallet=lower(new.inviter_wallet)
   ) THEN RAISE EXCEPTION 'MISSION_RETRY_FINALIZED_PAID_RECEIPT_REQUIRED'; END IF;
 END IF;
 RETURN new;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.authorize_mission_retry_eligibility_v1(
 p_network text,p_invite_code text,p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $authorize$
DECLARE i public.invitations%rowtype; s public.sybil_v2_referral_assessments%rowtype;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_auto_reset_settings_v1 WHERE id=1 AND enabled)
  OR NOT public.sybil_v2_enforcement_enabled()
 THEN RETURN jsonb_build_object('eligible',false,'reason','FEATURE_DISABLED'); END IF;

 -- Same lock ordering as existing assessment and clearance functions.
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_sybil_v2_'||p_invite_code,0));
 SELECT * INTO s FROM public.sybil_v2_referral_assessments
 WHERE invite_code=p_invite_code AND network=p_network FOR UPDATE;
 IF NOT FOUND OR s.revision IS DISTINCT FROM p_expected_revision THEN
  RETURN jsonb_build_object('eligible',false,'reason','STALE_ASSESSMENT'); END IF;
 SELECT * INTO i FROM public.invitations WHERE invite_code=p_invite_code
   AND activation_network=p_network FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason','MISSING'); END IF;
 IF NOT public.mission_retry_assessment_is_current_v1(p_invite_code,p_network,s.revision)
 THEN RETURN jsonb_build_object('eligible',false,'reason','CURRENT_CLEAR_ASSESSMENT_REQUIRED'); END IF;
 IF i.status='COMPLETED' AND i.reward_status='ELIGIBLE' THEN
  RETURN jsonb_build_object('eligible',true,'reused',true); END IF;
 IF i.status IS DISTINCT FROM 'ACTIVATING' OR i.reward_status IS DISTINCT FROM 'PENDING'
   OR i.sybil_status NOT IN ('NOT_CHECKED','CLEAR')
   OR EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=i.invite_code)
   OR EXISTS(SELECT 1 FROM public.reward_payouts p WHERE p.invite_code=i.invite_code)
   OR EXISTS(SELECT 1 FROM reward_admission_bridge.holds h WHERE h.network=p_network
       AND h.invite_code=i.invite_code AND h.status='HELD')
 THEN RETURN jsonb_build_object('eligible',false,'reason','INVITATION_PROTECTED'); END IF;

 -- Existing BEFORE triggers recompute identity and prove exact execution order.
 -- A failed eligibility/identity gate rolls the entire statement back.
 BEGIN
  UPDATE public.invitations SET status='COMPLETED',sybil_status='CLEAR',
    sybil_checked_at=clock_timestamp(),sybil_source='SYSTEM',
    sybil_risk_level='NONE',sybil_risk_score=s.risk_score,sybil_reason=NULL
  WHERE id=i.id RETURNING * INTO i;
  IF i.status IS DISTINCT FROM 'COMPLETED' OR i.reward_status IS DISTINCT FROM 'ELIGIBLE'
   OR i.sybil_status IS DISTINCT FROM 'CLEAR' OR i.reward_eligible_at IS NULL
  THEN RAISE EXCEPTION 'RETRY_EXISTING_ELIGIBILITY_GATE_REJECTED'; END IF;
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM IN ('MISSION_RETRY_CANONICAL_PAYOUT_NOT_ENABLED','RETRY_EXISTING_ELIGIBILITY_GATE_REJECTED')
  THEN RETURN jsonb_build_object('eligible',false,'reason','IDENTITY_OR_ELIGIBILITY_PENDING'); END IF;
  RAISE;
 END;
 RETURN jsonb_build_object('eligible',true,'reused',false);
END;
$authorize$;
REVOKE ALL ON FUNCTION public.authorize_mission_retry_eligibility_v1(text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_mission_retry_eligibility_v1(text,text,bigint) TO service_role;

-- Reviewed source: 20261124_mission_retry_canonical_funding_adapters_v1.sql
-- STAGED ONLY, NEVER APPLY IN PRODUCTION YET.
-- Core canonical payment/accounting context adapters, captured from actual
-- production function definitions on 2026-11-24. Run only with a reviewed
-- full eligibility/Sybil/identity cutover; the existing retry promotion guard
-- remains intentionally closed. No payout authorization is added here.
-- Do not apply individual definitions outside this transaction.

DO $snapshot_guard$
BEGIN
  IF md5(pg_get_functiondef('public.commit_reward_reservation(text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb)'::regprocedure)) IS DISTINCT FROM '388a984e1e9e2be591ccf67a26af9660' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: commit_reward_reservation(text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb)';
  END IF;
  IF md5(pg_get_functiondef('commit_reward_shared_pool_v1(text,text,numeric,timestamp with time zone,bigint)'::regprocedure)) IS DISTINCT FROM '699fa820e4e8a2e8055e82ec40422942' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: commit_reward_shared_pool_v1(text,text,numeric,timestamp with time zone,bigint)';
  END IF;
  IF md5(pg_get_functiondef('public.create_reward_x_promotion_live_split_from_queue()'::regprocedure)) IS DISTINCT FROM '8b9666d9aa8d8fb4ec47609925e1f0f4' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: create_reward_x_promotion_live_split_from_queue()';
  END IF;
  IF md5(pg_get_functiondef('public.enforce_reward_queue_cohort_budget()'::regprocedure)) IS DISTINCT FROM 'c15bbb7b653842ae6a68ef34798c5393' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: enforce_reward_queue_cohort_budget()';
  END IF;
  IF md5(pg_get_functiondef('public.read_reward_cohort_committed_wei(text,text,bigint,bigint)'::regprocedure)) IS DISTINCT FROM '3eaec379df305908989a47c4033ca139' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: read_reward_cohort_committed_wei(text,text,bigint,bigint)';
  END IF;
  IF md5(pg_get_functiondef('read_reward_reservation_candidates_v2(text,integer)'::regprocedure)) IS DISTINCT FROM 'a9a622b3054c27177ce2e6778ab78463' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: read_reward_reservation_candidates_v2(text,integer)';
  END IF;
  IF md5(pg_get_functiondef('public.validate_reward_x_promotion_split()'::regprocedure)) IS DISTINCT FROM '9715c0609bedfe180d85599396cf4685' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_SOURCE_CHANGED: validate_reward_x_promotion_split()';
  END IF;
END;
$snapshot_guard$;

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

  -- Keep the existing eligibility, emergency-pause, queue, recovery and
  -- security gates. Only the funding context is adapted.
  if exists(select 1 from public.read_effective_mission_reward_funding_v1(v_code,v_network) f
    where f.attempt_id is not null) then
    -- No retired pricing algorithm may reserve a retry against an old cohort.
    if p_algorithm_version IS DISTINCT FROM 'shared-pool-v1' then
      return jsonb_build_object('reserved',false,'reason','RETRY_REQUIRES_SHARED_POOL');
    end if;
    select f.reward_cohort_round_id,f.reward_funding_allocation_receipt_id
    into v_invitation.reward_cohort_round_id,v_invitation.reward_funding_allocation_receipt_id
    from public.read_effective_mission_reward_funding_v1(v_code,v_network) f;
    if v_invitation.reward_cohort_round_id is null
      or v_invitation.reward_funding_allocation_receipt_id is null then
      return jsonb_build_object('reserved',false,'reason','FUNDING_BINDING_MISSING');
    end if;
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

  -- For a retry, the immutable vote transaction determines completion
  -- order. Never select an event from the original mission.
  if exists(select 1 from public.read_effective_mission_reward_funding_v1(v_code,v_network) f
    where f.attempt_id is not null) then
    select f.completion_block,f.completion_tx_index,f.completion_clause_index,f.completion_tx_id
    into v_completion_block,v_completion_tx_index,v_completion_clause_index,v_completion_tx_id
    from public.read_effective_mission_reward_funding_v1(v_code,v_network) f;
    -- A clearance for the original attempt must not authorize a later vote.
    if v_clearance.id is null or v_clearance.evidence_cutoff_block is null
      or v_clearance.evidence_cutoff_block<v_completion_block
      or not public.mission_retry_assessment_is_current_v1(v_code,v_network,v_clearance.assessment_revision) then
      return jsonb_build_object('reserved',false,'reason','RETRY_CLEARANCE_NOT_CURRENT');
    end if;
  else
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
  end if;

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

 -- Use the verified completion funding only after an immutable binding exists.
 SELECT f.reward_cohort_round_id,f.reward_funding_allocation_receipt_id
 INTO v_inv.reward_cohort_round_id,v_inv.reward_funding_allocation_receipt_id
 FROM public.read_effective_mission_reward_funding_v1(v_code,p_network) f;

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

    if found then
      select f.reward_cohort_round_id,f.reward_funding_allocation_receipt_id
      into v_invitation.reward_cohort_round_id,v_invitation.reward_funding_allocation_receipt_id
      from public.read_effective_mission_reward_funding_v1(new.invite_code,new.network) f;
    end if;

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

  if found then
    select f.reward_cohort_round_id,f.reward_funding_allocation_receipt_id
    into v_invitation.reward_cohort_round_id,v_invitation.reward_funding_allocation_receipt_id
    from public.read_effective_mission_reward_funding_v1(new.invite_code,new.network) f;
  end if;

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
  cross join lateral public.read_effective_mission_reward_funding_v1(i.invite_code,q.network) f
  where q.network=p_network
    and f.reward_funding_allocation_receipt_id=v_receipt.id
    and f.reward_cohort_round_id=p_reward_cohort_round_id
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
  cross join lateral public.read_effective_mission_reward_funding_v1(i.invite_code,s.network) f
  where s.network=p_network
    and f.reward_funding_allocation_receipt_id=v_receipt.id
    and f.reward_cohort_round_id=p_reward_cohort_round_id
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
    funding.reward_cohort_round_id,
    funding.reward_funding_allocation_receipt_id
  from public.invitations i
  cross join parameters p
  cross join lateral public.read_effective_mission_reward_funding_v1(i.invite_code,p.network) funding
  left join public.sybil_v2_referral_assessments a
    on a.invite_code=i.invite_code
  left join public.sybil_v2_reward_clearances c
    on c.invite_code=i.invite_code
   and c.network=p.network
   and c.verdict='CLEAR'
   and c.verdict=a.state
   and c.assessment_revision=a.revision
  cross join lateral (
    select event.block_number,event.tx_index,event.clause_index
    from (
      select e.block_number,e.tx_index,e.clause_index
      from public.invite_impact_events e
      where funding.attempt_id is null
        and e.invite_code=i.invite_code
        and e.network=p.network
        and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
        and e.block_number is not null
        and e.tx_index is not null
        and e.clause_index is not null
      union all
      select funding.completion_block,funding.completion_tx_index,funding.completion_clause_index
      where funding.attempt_id is not null and funding.completion_block is not null
    ) event
    order by event.block_number desc,event.tx_index desc,event.clause_index desc
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
    and funding.reward_cohort_round_id is not null
    and funding.reward_funding_allocation_receipt_id is not null
    and (funding.attempt_id is null or
      (c.id is not null and c.evidence_cutoff_block>=funding.completion_block
        and public.mission_retry_assessment_is_current_v1(i.invite_code,p.network,c.assessment_revision)))
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

  if found then
    select f.reward_cohort_round_id,f.reward_funding_allocation_receipt_id
    into v_invitation.reward_cohort_round_id,v_invitation.reward_funding_allocation_receipt_id
    from public.read_effective_mission_reward_funding_v1(new.invite_code,new.network) f;
  end if;

  if not found
     or v_invitation.reward_cohort_round_id is null
     or v_invitation.reward_funding_allocation_receipt_id is null
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

-- Reviewed source: 20261124_mission_retry_vote_round_close_adapters_v1.sql
-- STAGED ONLY. The actual production vote-round-close policy remains the
-- sole authority for post-125 batch pricing. No alternative single-recipient
-- payout, changed policy, early withdrawal or reduced Sybil gate.

DO $snapshot$
BEGIN
 IF md5(pg_get_functiondef('public.commit_reward_vote_round_close_batch_v1(text,text,numeric,timestamp with time zone,bigint)'::regprocedure)) IS DISTINCT FROM '5f655d15c7600117037e8eacb6d44f74' THEN RAISE EXCEPTION 'MISSION_RETRY_ROUND_CLOSE_SOURCE_CHANGED:commit_reward_vote_round_close_batch_v1'; END IF;
 IF md5(pg_get_functiondef('public.read_reward_vote_round_candidates_v1(text,bigint)'::regprocedure)) IS DISTINCT FROM '0ef5491881f705c23cbc569767038a01' THEN RAISE EXCEPTION 'MISSION_RETRY_ROUND_CLOSE_SOURCE_CHANGED:read_reward_vote_round_candidates_v1'; END IF;
END;
$snapshot$;

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
           AND i.vote_completed_block=b.completion_block))
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
    funding.reward_cohort_round_id,
    funding.reward_funding_allocation_receipt_id
  from public.invitations i
  cross join parameters p
  cross join lateral public.read_effective_mission_reward_funding_v1(i.invite_code,p.network) funding
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
    from public.read_mission_effective_proof_events_v1(i.invite_code,p.network) e
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
    and funding.reward_cohort_round_id is not null
    and funding.reward_funding_allocation_receipt_id is not null
    and (funding.attempt_id is null or
      (funding.reward_cohort_round_id=p.target_round_id
       and c.id is not null and c.evidence_cutoff_block>=funding.completion_block
       and public.mission_retry_assessment_is_current_v1(i.invite_code,p.network,c.assessment_revision)))
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

-- Reviewed source: 20261124_mission_retry_forecast_v1.sql
-- Staged: private forecast input only, no payout writes.
-- Include real retry activity in its two-round window; zero-progress
-- dormant resets do not count as newly accepted referrals.
CREATE OR REPLACE FUNCTION public.read_mission_retry_forecast_rows_v1(
 p_network text,p_round_id bigint
) RETURNS TABLE(invite_code text,created_at timestamptz,status text,sybil_status text,
 reward_status text,ineligible_at timestamptz,apps_completed integer,activated_at timestamptz,
 apps_completed_at timestamptz,vote_completed_at timestamptz,vote_round_id bigint,
 slot_released_at timestamptz,retry_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $forecast$
 SELECT i.invite_code,i.created_at,i.status,i.sybil_status,i.reward_status,i.ineligible_at,
   count(e.id)::integer,i.activated_at,max(e.block_timestamp),i.vote_completed_at,
   i.vote_round_id,i.slot_released_at,true
 FROM reward_admission_bridge.mission_retry_attempts_v1 a
 JOIN public.invitations i ON i.id=a.invitation_id AND i.activation_network=a.network
 JOIN reward_admission_bridge.mission_retry_attempt_events_v1 e
   ON e.attempt_id=a.id AND e.event_type='DAPP_REWARD'
 WHERE a.network=p_network AND a.state='ACTIVE'
  AND p_round_id BETWEEN a.dapp_round_id AND a.vote_round_id
  AND i.status='ACTIVATING' AND i.reward_status='PENDING'
  AND i.sybil_status NOT IN ('BLOCKED','REVIEW')
  AND i.ineligible_at IS NULL AND i.slot_released_at IS NULL
  AND e.block_number BETWEEN a.attempt_start_block AND a.round_end_block
 GROUP BY i.id,i.invite_code,i.created_at,i.status,i.sybil_status,i.reward_status,i.ineligible_at,
  i.activated_at,i.vote_completed_at,i.vote_round_id,i.slot_released_at
 ORDER BY i.invite_code LIMIT 1000;
$forecast$;
REVOKE ALL ON FUNCTION public.read_mission_retry_forecast_rows_v1(text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_mission_retry_forecast_rows_v1(text,bigint) TO service_role;
DO $verify$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM reward_admission_bridge.mission_auto_reset_settings_v1 WHERE id=1 AND enabled=false) OR EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1) THEN RAISE EXCEPTION 'RESET_NOT_DISABLED'; END IF;
END; $verify$;
COMMIT;
