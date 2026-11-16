-- READ-ONLY baseline and future-only retry ledger. Initially disabled:
-- NO existing invitation, wallet identity, reward or Sybil record is changed.
-- Existing eligible/paid/blocked/review referrals are never eligible to retry.
CREATE TABLE IF NOT EXISTS reward_admission_bridge.mission_retry_settings_v1 (
 id smallint PRIMARY KEY CHECK(id=1),
 enabled boolean NOT NULL DEFAULT false,
 first_retry_round_id bigint NOT NULL DEFAULT 126 CHECK(first_retry_round_id>=126)
);
INSERT INTO reward_admission_bridge.mission_retry_settings_v1
(id,enabled,first_retry_round_id) VALUES(1,false,126) ON CONFLICT(id) DO NOTHING;
REVOKE ALL ON reward_admission_bridge.mission_retry_settings_v1 FROM PUBLIC,anon,authenticated;
ALTER TABLE reward_admission_bridge.mission_retry_settings_v1 ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS reward_admission_bridge.mission_retry_attempts_v1 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 invitation_id uuid NOT NULL REFERENCES public.invitations(id) ON DELETE RESTRICT,
 invite_code text NOT NULL,
 network text NOT NULL CHECK(network IN ('mainnet','testnet','testnet-staging')),
 attempt_no integer NOT NULL CHECK(attempt_no BETWEEN 1 AND 100),
 dapp_round_id bigint NOT NULL CHECK(dapp_round_id>=126),
 vote_round_id bigint GENERATED ALWAYS AS (dapp_round_id+1) STORED,
 attempt_start_block bigint NOT NULL CHECK(attempt_start_block>0),
 round_start_block bigint NOT NULL CHECK(round_start_block>0),
 round_end_block bigint NOT NULL CHECK(round_end_block>=round_start_block),
 entered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL DEFAULT 'ACTIVE' CHECK(state IN('ACTIVE','EXPIRED','FINISHED')),
 expired_at timestamptz,
 completed_at timestamptz,
 CONSTRAINT mission_attempt_block_in_round_v1 CHECK(attempt_start_block BETWEEN round_start_block AND round_end_block),
 CONSTRAINT mission_attempt_unique_v1 UNIQUE(invite_code,attempt_no),
 CONSTRAINT mission_attempt_round_unique_v1 UNIQUE(invite_code,dapp_round_id),
 CONSTRAINT mission_attempt_end_state_v1 CHECK (
   (state='ACTIVE' AND expired_at IS NULL AND completed_at IS NULL)
   OR (state='EXPIRED' AND expired_at IS NOT NULL AND completed_at IS NULL)
   OR (state='FINISHED' AND completed_at IS NOT NULL)
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS mission_retry_one_active_per_invite_v1
  ON reward_admission_bridge.mission_retry_attempts_v1(invite_code)
  WHERE state='ACTIVE';
REVOKE ALL ON reward_admission_bridge.mission_retry_attempts_v1 FROM PUBLIC,anon,authenticated;
ALTER TABLE reward_admission_bridge.mission_retry_attempts_v1 ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.read_invitation_mission_retry_state_v1(
 p_invite_code text,p_network text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $body$
DECLARE i public.invitations%rowtype;
 m reward_admission_bridge.mission_retry_attempts_v1%rowtype;
 v_cfg reward_admission_bridge.mission_retry_settings_v1%rowtype;
 round_now bigint;
 entered_round bigint;
 expiration_state text;
 v_protected boolean;
 v_restricted boolean;
 retry_allowed boolean:=false;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging') OR
    p_invite_code IS NULL OR upper(btrim(p_invite_code)) !~ '^[A-HJ-NP-Z2-9]{7}$' THEN
    RAISE EXCEPTION 'INVALID_MISSION_STATE_INPUT';
 END IF;
 SELECT * INTO i FROM public.invitations
  WHERE invite_code=upper(btrim(p_invite_code)) AND activation_network=p_network;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','MISSING','restartEligible',false); END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.mission_retry_settings_v1 WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'MISSION_RETRY_SETTINGS_MISSING'; END IF;
 SELECT max(vebetter_round_id)+1 INTO round_now
 FROM public.vebetter_round_allocations
 WHERE network=p_network
 AND app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 SELECT * INTO m FROM reward_admission_bridge.mission_retry_attempts_v1
 WHERE invite_code=i.invite_code ORDER BY attempt_no DESC LIMIT 1;
 entered_round:=coalesce(m.dapp_round_id,i.reward_cohort_round_id);
 v_protected:=i.status='COMPLETED' OR i.reward_status IN('PAID','ELIGIBLE')
   OR EXISTS(SELECT 1 FROM public.reward_queue_entries q
      WHERE q.invite_code=i.invite_code AND q.reserved_amount_wei IS NOT NULL)
   OR EXISTS(SELECT 1 FROM public.reward_payouts p
      WHERE p.invite_code=i.invite_code AND p.status='PAID');
 v_restricted:=i.status<>'ACTIVATING' OR i.reward_status<>'PENDING' OR
   i.sybil_status IN('REVIEW','BLOCKED') OR i.ineligible_at IS NOT NULL OR
   i.invitee_wallet IS NULL OR i.eligibility_check_id IS NULL OR
   EXISTS(SELECT 1 FROM reward_admission_bridge.holds h WHERE
     h.invite_code=i.invite_code AND h.network=p_network AND h.status='HELD');
 IF v_protected THEN expiration_state:='COMPLETION_PROTECTED';
 ELSIF i.status='CANCELLED' OR i.sybil_status='BLOCKED' OR i.reward_status='FORFEITED'
    THEN expiration_state:='TERMINAL';
 ELSIF i.sybil_status='REVIEW' OR i.status='UNDER_REVIEW' THEN expiration_state:='SECURITY_REVIEW';
 ELSIF round_now IS NULL THEN expiration_state:='ROUND_UNVERIFIED';
 ELSIF entered_round IS NULL THEN
    expiration_state:= CASE
      WHEN i.status='ACTIVATING' AND i.vote_completed=false
       AND i.activated_at<clock_timestamp()-interval '30 days'
      THEN 'LEGACY_UNBOUND_EXPIRED_REVIEW'
      ELSE 'LEGACY_UNBOUND_REVIEW' END;
 ELSIF entered_round>round_now THEN expiration_state:='FUTURE_ROUND_INVALID';
 ELSIF round_now=entered_round THEN expiration_state:='DAPP_WINDOW';
 ELSIF round_now=entered_round+1 THEN expiration_state:='VOTE_WINDOW';
 ELSE
    expiration_state:='EXPIRED';
    retry_allowed:=v_cfg.enabled AND round_now>=v_cfg.first_retry_round_id AND NOT v_restricted;
 END IF;
 RETURN jsonb_build_object(
  'state',expiration_state,'restartEligible',retry_allowed,
  'currentRoundId',round_now,'attemptRoundId',entered_round,
  'voteRoundId',CASE WHEN entered_round IS NOT NULL THEN entered_round+1 ELSE NULL END,
  'latestAttemptNo',m.attempt_no,'retriesEnabled',v_cfg.enabled
 );
END;
$body$;
REVOKE ALL ON FUNCTION public.read_invitation_mission_retry_state_v1(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_invitation_mission_retry_state_v1(text,text) TO service_role;

-- This is a conditional attempt recorder only, NOT mission activation.
-- It is intentionally disabled in Production until the attempt-aware
-- on-chain scanner and canonical reward writer pass additional QA.
CREATE OR REPLACE FUNCTION public.begin_invitation_mission_retry_v1(
 p_invite_code text,p_network text,p_round_id bigint,p_start_block bigint,
 p_round_start_block bigint,p_round_end_block bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $body$
DECLARE
 v_cfg reward_admission_bridge.mission_retry_settings_v1%rowtype;
 i public.invitations%rowtype;
 prior reward_admission_bridge.mission_retry_attempts_v1%rowtype;
 latest_funding public.vebetter_round_allocations%rowtype;
 v_mission_state jsonb;
 next_attempt integer;
BEGIN
 IF p_network NOT IN('mainnet','testnet','testnet-staging')
    OR p_invite_code IS NULL OR upper(btrim(p_invite_code)) !~ '^[A-HJ-NP-Z2-9]{7}$'
    OR p_round_id IS NULL OR p_start_block IS NULL OR
    p_round_start_block IS NULL OR p_round_end_block IS NULL
    OR p_round_id<126 OR p_start_block<=0 OR p_round_start_block<=0
    OR p_start_block NOT BETWEEN p_round_start_block AND p_round_end_block
    OR p_round_end_block<=p_round_start_block THEN
   RAISE EXCEPTION 'INVALID_MISSION_RETRY_INPUT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_mission_retry_'||p_network||'_'||p_invite_code,0));
 SELECT * INTO v_cfg FROM reward_admission_bridge.mission_retry_settings_v1 WHERE id=1 FOR SHARE;
 IF NOT FOUND OR NOT v_cfg.enabled THEN
   RETURN jsonb_build_object('started',false,'reason','FEATURE_DISABLED');
 END IF;
 IF p_round_id<v_cfg.first_retry_round_id THEN
   RETURN jsonb_build_object('started',false,'reason','BEFORE_ROLLOUT');
 END IF;
 SELECT * INTO i FROM public.invitations
 WHERE invite_code=upper(btrim(p_invite_code)) AND activation_network=p_network FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('started',false,'reason','INVITATION_MISSING'); END IF;
 SELECT * INTO latest_funding FROM public.vebetter_round_allocations
 WHERE network=p_network
 AND app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
 ORDER BY vebetter_round_id DESC,id DESC LIMIT 1;
 IF NOT FOUND OR p_round_id<>latest_funding.vebetter_round_id+1
    OR latest_funding.claim_block_number IS NULL
    OR p_start_block<latest_funding.claim_block_number THEN
  RETURN jsonb_build_object('started',false,'reason','UNVERIFIED_CURRENT_ROUND');
 END IF;
 v_mission_state:=public.read_invitation_mission_retry_state_v1(i.invite_code,p_network);
 IF v_mission_state->>'state'<>'EXPIRED' OR coalesce((v_mission_state->>'restartEligible')::boolean,false)=false THEN
   RETURN jsonb_build_object('started',false,'reason','NOT_RESTART_ELIGIBLE',
      'state',v_mission_state->>'state');
 END IF;
 SELECT * INTO prior FROM reward_admission_bridge.mission_retry_attempts_v1
 WHERE invite_code=i.invite_code ORDER BY attempt_no DESC LIMIT 1 FOR UPDATE;
 IF prior.id IS NOT NULL AND prior.state='ACTIVE' THEN
    IF prior.vote_round_id>=p_round_id THEN
       RETURN jsonb_build_object('started',false,'reason','ACTIVE_ATTEMPT');
    END IF;
    UPDATE reward_admission_bridge.mission_retry_attempts_v1
    SET state='EXPIRED',expired_at=clock_timestamp()
    WHERE id=prior.id AND state='ACTIVE';
 END IF;
 next_attempt:=coalesce(prior.attempt_no,0)+1;
 IF next_attempt>100 THEN
   RETURN jsonb_build_object('started',false,'reason','RETRY_LIMIT_REVIEW');
 END IF;
 INSERT INTO reward_admission_bridge.mission_retry_attempts_v1
 (invitation_id,invite_code,network,attempt_no,dapp_round_id,
  attempt_start_block,round_start_block,round_end_block)
 VALUES(i.id,i.invite_code,p_network,next_attempt,p_round_id,
   p_start_block,p_round_start_block,p_round_end_block);
 RETURN jsonb_build_object('started',true,'attemptNo',next_attempt,
 'dappRoundId',p_round_id,'voteRoundId',p_round_id+1);
END;
$body$;
REVOKE ALL ON FUNCTION public.begin_invitation_mission_retry_v1(
 text,text,bigint,bigint,bigint,bigint)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_invitation_mission_retry_v1(
 text,text,bigint,bigint,bigint,bigint) TO service_role;
