-- DRAFT COMPONENT ONLY — DO NOT APPLY OR MERGE AS A MIGRATION.
-- Derived from deployed migration 20261124071846. Requires completion-binding,
-- expiry, initial mission, Sybil, settlement and integration changes together.
-- A verified early vote is recorded independently of full completion.
-- Preserve old migration, access rules, immutable records and finality checks.

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
  IF NOT FOUND OR a.state<>'ACTIVE' THEN
    RAISE EXCEPTION 'MISSION_ATTEMPT_EVENT_STATE_INVALID';
  END IF;
  IF new.block_number<a.attempt_start_block THEN
    RAISE EXCEPTION 'MISSION_ATTEMPT_EVENT_BEFORE_RESET';
  END IF;
  IF new.event_type='DAPP_REWARD' THEN
    IF new.block_number>coalesce(a.vote_window_end_block,a.round_end_block) THEN
      RAISE EXCEPTION 'MISSION_ATTEMPT_DAPP_OUTSIDE_ROUND';
    END IF;
  ELSIF new.event_type='VOT3_CONVERSION' THEN
    IF new.block_number>coalesce(a.vote_window_end_block,a.round_end_block) THEN
      RAISE EXCEPTION 'MISSION_ATTEMPT_CONVERSION_OUTSIDE_WINDOW';
    END IF;
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
       a.vote_window_start_block IS NULL OR a.vote_window_end_block IS NULL OR
       new.block_number NOT BETWEEN a.vote_window_start_block AND a.vote_window_end_block THEN
      RAISE EXCEPTION 'MISSION_ATTEMPT_VOTE_WRONG_ROUND';
    END IF;
    SELECT count(*) INTO dapp_count
    FROM reward_admission_bridge.mission_retry_attempt_events_v1 e
    WHERE e.attempt_id=a.id AND e.event_type='DAPP_REWARD';
    SELECT e.block_number,e.tx_index,e.clause_index INTO conversion
    FROM reward_admission_bridge.mission_retry_attempt_events_v1 e
    WHERE e.attempt_id=a.id AND e.event_type='VOT3_CONVERSION'
    LIMIT 1;
    IF dapp_count<1 THEN
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

REVOKE ALL ON FUNCTION public.validate_mission_attempt_event_v1() FROM PUBLIC,anon,authenticated;

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

  -- Persist the verified bounds before the insert trigger reads them.
  -- The enclosing transaction rolls back the bounds if an event is rejected.
  UPDATE reward_admission_bridge.mission_retry_attempts_v1
  SET vote_window_start_block=p_vote_start_block,vote_window_end_block=p_vote_end_block
  WHERE id=a.id;

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
           OR e.block_number>coalesce(p_vote_end_block,a.round_end_block)))
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
  AND e.block_number BETWEEN a.attempt_start_block AND coalesce(a.vote_window_end_block,a.round_end_block)
 GROUP BY i.id,i.invite_code,i.created_at,i.status,i.sybil_status,i.reward_status,i.ineligible_at,
  i.activated_at,i.vote_completed_at,i.vote_round_id,i.slot_released_at
 ORDER BY i.invite_code LIMIT 1000;
$forecast$;

REVOKE ALL ON FUNCTION public.read_mission_retry_forecast_rows_v1(text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_mission_retry_forecast_rows_v1(text,bigint) TO service_role;
