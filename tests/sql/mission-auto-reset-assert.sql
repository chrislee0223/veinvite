\set ON_ERROR_STOP on
-- All values, wallets and transactions below are fake isolated fixtures.
DO $$
DECLARE v jsonb;
BEGIN
 SELECT public.commit_invitation_mission_auto_reset_v1(
  'EDFW4Y7','mainnet',126,126,1000,1999,900,2100) INTO v;
 IF v->>'reason' <> 'FEATURE_DISABLED' THEN RAISE EXCEPTION 'Must begin disabled: %',v; END IF;
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1)
   OR EXISTS(SELECT 1 FROM public.invite_notification_history) THEN
   RAISE EXCEPTION 'Disabled feature mutated data';
 END IF;
END $$;

UPDATE reward_admission_bridge.mission_auto_reset_settings_v1
SET enabled=true WHERE id=1;

-- Reject incorrect chain/round or not-finalized proof.
DO $$
DECLARE v jsonb;
BEGIN
 SELECT public.commit_invitation_mission_auto_reset_v1(
  'EDFW4Y7','mainnet',126,127,1000,1999,900,2100) INTO v;
 IF v->>'reason' <> 'ROUND_FINALITY_OR_BOUNDS_UNVERIFIED'
 THEN RAISE EXCEPTION 'Wrong round accepted: %',v; END IF;
 SELECT public.commit_invitation_mission_auto_reset_v1(
  'EDFW4Y7','mainnet',126,126,1000,1999,995,1005) INTO v;
 IF v->>'reason' <> 'ROUND_FINALITY_OR_BOUNDS_UNVERIFIED'
 THEN RAISE EXCEPTION 'Unfinalized round accepted: %',v; END IF;
 SELECT public.commit_invitation_mission_auto_reset_v1(
  'EDFW4Y7','mainnet',127,126,1000,1999,900,2100) INTO v;
 IF v->>'reason' <> 'UNVERIFIED_CURRENT_ROUND'
 THEN RAISE EXCEPTION 'Wrong current round accepted: %',v; END IF;
 SELECT public.commit_invitation_mission_auto_reset_v1(
  'ACXKGKC','mainnet',126,126,1000,1999,900,2100) INTO v;
 IF v->>'reason' <> 'INVITATION_PROTECTED'
 THEN RAISE EXCEPTION 'Eligible referral was reset: %',v; END IF;
 SELECT public.commit_invitation_mission_auto_reset_v1(
  'WVYTYY6','mainnet',126,126,1000,1999,900,2100) INTO v;
 IF v->>'reason' <> 'INVITATION_PROTECTED'
 THEN RAISE EXCEPTION 'Unbound old referral was reset: %',v; END IF;
END $$;

-- A forensic HOLD or an ACTIVE wallet restriction must stop
-- automatic reset even when the inviter's historic evidence is otherwise valid.
DO $anti_abuse$
DECLARE v jsonb;
BEGIN
  INSERT INTO public.sybil_v2_wallet_restrictions
  (related_invite_code,status,wallet_address,network)
  VALUES ('C5RV7QG','ACTIVE','0x1111111111111111111111111111111111111111','mainnet');
  SELECT public.commit_invitation_mission_auto_reset_v1(
    'C5RV7QG','mainnet',126,126,1000,1999,900,2100) INTO v;
  IF v->>'reason'<>'INVITATION_PROTECTED'
  THEN RAISE EXCEPTION 'Active blocked wallet was reset: %',v; END IF;
  DELETE FROM public.sybil_v2_wallet_restrictions
  WHERE related_invite_code='C5RV7QG';

  INSERT INTO public.sybil_v2_referral_assessments
  (invite_code,state,updated_at,reason_codes)
  VALUES ('C5RV7QG','HOLD',now(),'[]');
  SELECT public.commit_invitation_mission_auto_reset_v1(
    'C5RV7QG','mainnet',126,126,1000,1999,900,2100) INTO v;
  IF v->>'reason'<>'INVITATION_PROTECTED'
  THEN RAISE EXCEPTION 'Held Sybil assessment was reset: %',v; END IF;
  DELETE FROM public.sybil_v2_referral_assessments
  WHERE invite_code='C5RV7QG';

  IF EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1
    WHERE invite_code='C5RV7QG')
  THEN RAISE EXCEPTION 'Sybil restricted user was given a new attempt'; END IF;
END $anti_abuse$;

-- Normal assessment pending is not a restriction. Preserve the pending
-- assessment; the canonical payout/Sybil gate remains closed.
INSERT INTO public.sybil_v2_referral_assessments
(invite_code,state,updated_at,reason_codes)
VALUES ('EDFW4Y7','ANALYSIS_PENDING',now(),'[]');

-- Belgian case: original 124, missed 125 vote, automatic 126 dApp and 127 vote.
DO $$
DECLARE v jsonb; i public.invitations%rowtype;
BEGIN
 SELECT * INTO i FROM public.invitations WHERE invite_code='EDFW4Y7';
 SELECT public.commit_invitation_mission_auto_reset_v1(
   'EDFW4Y7','mainnet',126,126,1000,1999,900,2100) INTO v;
 IF v->>'started'<>'true' OR v->>'dappRoundId'<>'126' OR
    v->>'voteRoundId'<>'127' OR v->>'attemptNo'<>'1'
 THEN RAISE EXCEPTION 'Legitimate reset failed: %',v; END IF;
 IF (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempts_v1
     WHERE invite_code='EDFW4Y7' AND attempt_start_block=1000
       AND dapp_round_id=126 AND vote_round_id=127 AND state='ACTIVE') <> 1
 THEN RAISE EXCEPTION 'Wrong round block or missing active attempt'; END IF;
 IF (SELECT count(*) FROM public.invite_notification_history
     WHERE invite_code='EDFW4Y7' AND kind='MISSION_PROGRESS_RESET'
       AND dapp_progress=0 AND recipient_wallet=lower(i.invitee_wallet)
       AND dedupe_key='mission-auto-reset-v1:EDFW4Y7:126') <> 1
 THEN RAISE EXCEPTION 'No exactly-once invitee notice'; END IF;
 IF (SELECT inviter_wallet FROM public.invitations WHERE invite_code='EDFW4Y7')
     IS DISTINCT FROM i.inviter_wallet OR
    (SELECT invitee_wallet FROM public.invitations WHERE invite_code='EDFW4Y7')
     IS DISTINCT FROM i.invitee_wallet OR
    (SELECT slot_released_at FROM public.invitations WHERE invite_code='EDFW4Y7')
     IS DISTINCT FROM i.slot_released_at OR
    (SELECT reward_cohort_round_id FROM public.invitations WHERE invite_code='EDFW4Y7')
     IS DISTINCT FROM i.reward_cohort_round_id
 THEN RAISE EXCEPTION 'Reset mutated original referral/slot/funding'; END IF;
END $$;

DO $$
DECLARE v jsonb;
BEGIN
 SELECT public.commit_invitation_mission_auto_reset_v1(
   'EDFW4Y7','mainnet',126,126,1000,1999,900,2100) INTO v;
 IF v->>'reason'<>'ALREADY_RESET'
 THEN RAISE EXCEPTION 'Duplicate request not idempotent: %',v; END IF;
 IF (SELECT count(*) FROM public.invite_notification_history
     WHERE invite_code='EDFW4Y7')<>1
 THEN RAISE EXCEPTION 'Duplicate notice delivered'; END IF;
END $$;

DO $zero_progress$
DECLARE p jsonb;
BEGIN
 SELECT public.read_mission_auto_reset_progress_v1('mainnet',ARRAY['EDFW4Y7','ACXKGKC']) INTO p;
 IF jsonb_array_length(p)<>1 OR p->0->>'appsCompleted'<>'0'
 OR p->0->>'vot3Converted'<>'false' OR p->0->>'voteCompleted'<>'false'
 OR p->0->>'attemptNo'<>'1' OR p->0->>'dappRoundId'<>'126'
 THEN RAISE EXCEPTION 'Fresh reset projection wrong: %',p; END IF;
 IF p->0->>'completionRoundId' IS NOT NULL THEN
   RAISE EXCEPTION 'Unfinished attempt already has settlement round'; END IF;
END $zero_progress$;

-- Second missed attempt at N+4, preserving both append-only attempt entries.
INSERT INTO public.vebetter_round_allocations
(network,app_id,vebetter_round_id,claim_block_number)
VALUES ('mainnet',
'0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
127, 2900);

DO $$
DECLARE v jsonb;
BEGIN
 SELECT public.commit_invitation_mission_auto_reset_v1(
   'EDFW4Y7','mainnet',128,128,3000,3999,2900,4100) INTO v;
 IF v->>'started'<>'true' OR v->>'attemptNo'<>'2'
 THEN RAISE EXCEPTION 'Next automatic reset failed: %',v; END IF;
 IF (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempts_v1
     WHERE invite_code='EDFW4Y7' AND state='EXPIRED') <> 1 OR
    (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempts_v1
     WHERE invite_code='EDFW4Y7' AND state='ACTIVE') <> 1 OR
    (SELECT count(*) FROM public.invite_notification_history
     WHERE invite_code='EDFW4Y7') <> 2
 THEN RAISE EXCEPTION 'Repeated expiry failed to preserve history/notice'; END IF;
END $$;

-- Old scanner promotion must never qualify a retry using the original
-- immutable 3/3 evidence. Existing non-retry completions remain untouched.
DO $guard_test$
BEGIN
  BEGIN
    UPDATE public.invitations SET status='COMPLETED', reward_status='ELIGIBLE'
    WHERE invite_code='EDFW4Y7';
    RAISE EXCEPTION 'UNBLOCKED_LEGACY_PROMOTION';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'MISSION_RETRY_CANONICAL_PAYOUT_NOT_ENABLED' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM public.invitations WHERE invite_code='EDFW4Y7')<>'ACTIVATING'
  OR (SELECT reward_status FROM public.invitations WHERE invite_code='EDFW4Y7')<>'PENDING'
  THEN RAISE EXCEPTION 'Legacy promotion mutated retry'; END IF;

  UPDATE public.invitations SET status='COMPLETED', reward_status='ELIGIBLE'
  WHERE invite_code='C5RV7QG';
  IF (SELECT status FROM public.invitations WHERE invite_code='C5RV7QG')<>'COMPLETED'
  THEN RAISE EXCEPTION 'New guard broke non-retry completed users'; END IF;
END $guard_test$;

-- A second attempt can repeat the same external dApp; only within-attempt
-- double counting is forbidden. This is incompatible with the legacy
-- UNIQUE(invite_code,app_id) attribution and therefore must stay separate.
DO $reset_reuse_test$
DECLARE first_id bigint; second_id bigint; app text := '0x'||repeat('a',64);
BEGIN
 SELECT id INTO first_id FROM reward_admission_bridge.mission_retry_attempts_v1
 WHERE invite_code='EDFW4Y7' AND attempt_no=1;
 SELECT id INTO second_id FROM reward_admission_bridge.mission_retry_attempts_v1
 WHERE invite_code='EDFW4Y7' AND attempt_no=2;
 INSERT INTO reward_admission_bridge.mission_retry_attempt_events_v1
 (attempt_id,event_type,app_id,amount_wei,vote_round_id,tx_id,
  block_number,tx_index,clause_index,block_timestamp)
 VALUES
 (first_id,'DAPP_REWARD',app,'1',null,'0x'||repeat('1',64),
  1200,0,0,clock_timestamp()),
 (second_id,'DAPP_REWARD',app,'1',null,'0x'||repeat('2',64),
  3200,0,0,clock_timestamp());
 IF (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempt_events_v1
     WHERE app_id=app)<>2 THEN
   RAISE EXCEPTION 'Reused same dApp was not allowed across different attempts';
 END IF;
 BEGIN
  INSERT INTO reward_admission_bridge.mission_retry_attempt_events_v1
  (attempt_id,event_type,app_id,amount_wei,vote_round_id,tx_id,
   block_number,tx_index,clause_index,block_timestamp)
  VALUES (second_id,'DAPP_REWARD',app,'1',null,'0x'||repeat('3',64),
   3300,0,0,clock_timestamp());
  RAISE EXCEPTION 'Duplicate same-attempt dApp was wrongly counted';
 EXCEPTION WHEN unique_violation THEN
  NULL;
 END;
END $reset_reuse_test$;

-- Verify strict bounds, event sequencing and immutable append-only evidence.
DO $event_safety$
DECLARE second_id bigint; source_id bigint;
BEGIN
  SELECT id INTO second_id
  FROM reward_admission_bridge.mission_retry_attempts_v1
  WHERE invite_code='EDFW4Y7' AND attempt_no=2;
  SELECT id INTO source_id
  FROM reward_admission_bridge.mission_retry_attempt_events_v1
  WHERE attempt_id=second_id LIMIT 1;

  BEGIN
    INSERT INTO reward_admission_bridge.mission_retry_attempt_events_v1
     (attempt_id,event_type,app_id,amount_wei,vote_round_id,tx_id,block_number,tx_index,clause_index,block_timestamp)
    VALUES (second_id,'DAPP_REWARD','0x'||repeat('d',64),'1',NULL,
      '0x'||repeat('6',64),2999,0,0,clock_timestamp());
    RAISE EXCEPTION 'BAD_OLD_EVENT_ACCEPTED';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'MISSION_ATTEMPT_EVENT_BEFORE_RESET' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO reward_admission_bridge.mission_retry_attempt_events_v1
     (attempt_id,event_type,app_id,amount_wei,vote_round_id,tx_id,block_number,tx_index,clause_index,block_timestamp)
    VALUES (second_id,'DAPP_REWARD','0x'||repeat('d',64),'1',NULL,
      '0x'||repeat('6',64),4000,0,0,clock_timestamp());
    RAISE EXCEPTION 'BAD_LATE_DAPP_ACCEPTED';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'MISSION_ATTEMPT_DAPP_OUTSIDE_ROUND' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO reward_admission_bridge.mission_retry_attempt_events_v1
     (attempt_id,event_type,app_id,amount_wei,vote_round_id,tx_id,block_number,tx_index,clause_index,block_timestamp)
    VALUES (second_id,'VOT3_CONVERSION',NULL,'1',NULL,
      '0x'||repeat('7',64),3100,0,0,clock_timestamp());
    RAISE EXCEPTION 'BAD_EARLY_CONVERSION_ACCEPTED';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'MISSION_ATTEMPT_CONVERSION_BEFORE_DAPP' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO reward_admission_bridge.mission_retry_attempt_events_v1
     (attempt_id,event_type,app_id,amount_wei,vote_round_id,tx_id,block_number,tx_index,clause_index,block_timestamp)
    VALUES (second_id,'ALLOCATION_VOTE',NULL,NULL,130,
      '0x'||repeat('8',64),4001,0,0,clock_timestamp());
    RAISE EXCEPTION 'BAD_ROUND_VOTE_ACCEPTED';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'MISSION_ATTEMPT_VOTE_WRONG_ROUND' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM reward_admission_bridge.mission_retry_attempt_events_v1
    WHERE id=source_id;
    RAISE EXCEPTION 'IMMUTABLE_EVENT_WAS_DELETED';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'MISSION_ATTEMPT_EVENTS_IMMUTABLE' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE reward_admission_bridge.mission_retry_attempt_events_v1
    SET amount_wei='999' WHERE id=source_id;
    RAISE EXCEPTION 'IMMUTABLE_EVENT_WAS_CHANGED';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'MISSION_ATTEMPT_EVENTS_IMMUTABLE' THEN RAISE; END IF;
  END;

  -- Three new distinct dApps, fresh conversion and correct next round vote
  -- are accepted, without any reuse of the original invitation records.
  INSERT INTO reward_admission_bridge.mission_retry_attempt_events_v1
   (attempt_id,event_type,app_id,amount_wei,vote_round_id,tx_id,block_number,tx_index,clause_index,block_timestamp)
  VALUES
   (second_id,'DAPP_REWARD','0x'||repeat('b',64),'2',NULL,'0x'||repeat('4',64),3201,0,0,clock_timestamp()),
   (second_id,'DAPP_REWARD','0x'||repeat('c',64),'2',NULL,'0x'||repeat('5',64),3202,0,0,clock_timestamp());
  INSERT INTO reward_admission_bridge.mission_retry_attempt_events_v1
   (attempt_id,event_type,app_id,amount_wei,vote_round_id,tx_id,block_number,tx_index,clause_index,block_timestamp)
  VALUES
   (second_id,'VOT3_CONVERSION',NULL,'1',NULL,'0x'||repeat('7',64),3500,0,0,clock_timestamp());
  INSERT INTO reward_admission_bridge.mission_retry_attempt_events_v1
   (attempt_id,event_type,app_id,amount_wei,vote_round_id,tx_id,block_number,tx_index,clause_index,block_timestamp)
  VALUES
   (second_id,'ALLOCATION_VOTE',NULL,NULL,129,'0x'||repeat('8',64),4001,0,0,clock_timestamp());
  IF (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempt_events_v1
      WHERE attempt_id=second_id AND event_type='DAPP_REWARD')<>3 OR
     (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempt_events_v1
      WHERE attempt_id=second_id AND event_type='ALLOCATION_VOTE')<>1
  THEN RAISE EXCEPTION 'Valid fresh proof not persisted'; END IF;
END $event_safety$;

-- The latest attempt is the sole effective progress source. Persist an
-- idempotent snapshot and prove settlement uses the NEW vote round.
INSERT INTO public.vebetter_round_allocations
(network,app_id,vebetter_round_id,claim_block_number)
VALUES ('mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',128,4000);
DO $project$
DECLARE p jsonb; events jsonb; r jsonb; aid bigint; expected_funding bigint;
BEGIN
 SELECT id INTO aid FROM reward_admission_bridge.mission_retry_attempts_v1
  WHERE invite_code='EDFW4Y7' AND attempt_no=2;
 SELECT jsonb_agg(to_jsonb(e)-'id'-'attempt_id'-'recorded_at') INTO events
  FROM reward_admission_bridge.mission_retry_attempt_events_v1 e WHERE e.attempt_id=aid;
 SELECT public.record_mission_auto_reset_progress_v1('mainnet','EDFW4Y7',2,128,3000,3999,4000,4999,4100,events) INTO r;
 IF r->>'recorded'<>'true' THEN RAISE EXCEPTION 'Progress persistence failed: %',r; END IF;
 SELECT public.record_mission_auto_reset_progress_v1('mainnet','EDFW4Y7',2,128,3000,3999,4000,4999,4100,events) INTO r;
 IF r->>'recorded'<>'true' THEN RAISE EXCEPTION 'Idempotent scan failed: %',r; END IF;
 SELECT public.record_mission_auto_reset_progress_v1('mainnet','EDFW4Y7',1,126,1000,1999,2000,2999,4100,'[]') INTO r;
 IF r->>'reason'<>'STALE_ATTEMPT' THEN RAISE EXCEPTION 'Stale scan accepted: %',r; END IF;
 SELECT id INTO expected_funding FROM public.vebetter_round_allocations WHERE network='mainnet' AND vebetter_round_id=128;
 SELECT public.read_mission_auto_reset_progress_v1('mainnet',ARRAY['EDFW4Y7']) INTO p;
 IF p->0->>'appsCompleted'<>'3' OR p->0->>'voteCompleted'<>'true'
  OR p->0->>'completionRoundId'<>'129'
  OR p->0->>'fundingAllocationReceiptId'<>expected_funding::text
 THEN RAISE EXCEPTION 'Current completion projection wrong: %',p; END IF;
 IF (SELECT reward_status FROM public.invitations WHERE invite_code='EDFW4Y7')<>'PENDING'
 THEN RAISE EXCEPTION 'Projection accidentally granted payout'; END IF;
END $project$;

-- Completed retries bind their immutable vote round, not an older
-- invitation cohort or the round in which a delayed worker runs.
DO $binding_test$
DECLARE r jsonb; expected_funding bigint; bound_count bigint;
BEGIN
 SELECT public.bind_mission_retry_completion_v1('mainnet','EDFW4Y7',1) INTO r;
 IF r->>'reason'<>'STALE_ATTEMPT' THEN RAISE EXCEPTION 'Old attempt bound: %',r; END IF;
 SELECT id INTO expected_funding FROM public.vebetter_round_allocations
 WHERE network='mainnet' AND vebetter_round_id=128;
 SELECT public.bind_mission_retry_completion_v1('mainnet','EDFW4Y7',2) INTO r;
 IF r->>'bound'<>'true' OR r->>'completionRoundId'<>'129'
    OR r->>'fundingAllocationReceiptId'<>expected_funding::text
 THEN RAISE EXCEPTION 'Wrong completion funding binding: %',r; END IF;
 SELECT public.bind_mission_retry_completion_v1('mainnet','EDFW4Y7',2) INTO r;
 SELECT count(*) INTO bound_count FROM reward_admission_bridge.mission_retry_settlement_bindings_v1;
 IF r->>'bound'<>'true' OR bound_count<>1 THEN RAISE EXCEPTION 'Duplicate binding: %',r; END IF;
 IF (SELECT reward_cohort_round_id FROM public.invitations WHERE invite_code='EDFW4Y7')<>124
    OR EXISTS(SELECT 1 FROM public.reward_queue_entries WHERE invite_code='EDFW4Y7')
    OR EXISTS(SELECT 1 FROM public.reward_payouts WHERE invite_code='EDFW4Y7')
 THEN RAISE EXCEPTION 'Binding mutated entry or moved funds'; END IF;
END $binding_test$;

-- Advancing to 130 cannot expire the prior attempt after a verified vote.
INSERT INTO public.vebetter_round_allocations(network,app_id,vebetter_round_id,claim_block_number)
VALUES ('mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',129,4999);
DO $completed_guard$
DECLARE r jsonb;
BEGIN
 SELECT public.commit_invitation_mission_auto_reset_v1('EDFW4Y7','mainnet',130,130,5000,5999,4999,5200) INTO r;
 IF r->>'reason'<>'PREVIOUS_ATTEMPT_PROTECTED' THEN
    RAISE EXCEPTION 'Verified prior completion was not protected: %',r; END IF;
 IF (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempts_v1 WHERE invite_code='EDFW4Y7')<>2
 THEN RAISE EXCEPTION 'Completed mission was reset again'; END IF;
END $completed_guard$;

-- Turn off all writes: the default safety gate remains an independent switch.
UPDATE reward_admission_bridge.mission_auto_reset_settings_v1
SET enabled=false WHERE id=1;
SELECT 'mission-auto-reset-staged-qa-pass' as result;
