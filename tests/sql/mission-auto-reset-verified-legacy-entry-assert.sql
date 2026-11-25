\set ON_ERROR_STOP on
-- Disposable fixture only. No production identities or RPCs.
BEGIN;
\ir ../../docs/staged-sql/mission_two_round_expiry_draft.sql
\ir ../../docs/staged-sql/mission_two_round_retry_event_bounds_draft.sql
\ir ../../docs/staged-sql/mission_two_round_completion_funding_draft.sql
\ir ../../docs/staged-sql/mission_two_round_original_admission_draft.sql
ALTER TABLE public.eligibility_check_events ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS prior_reward_tx_id text, ADD COLUMN IF NOT EXISTS prior_vote_tx_id text;
\ir ../../docs/staged-sql/mission_legacy_verified_entry_recovery_draft.sql
\ir ../../docs/staged-sql/mission_two_round_silent_empty_renewal_draft.sql
SELECT set_config('veinvite.qa_legacy', :'legacy', false);
-- Empty original mission and empty retry: renew twice without a notice.
SAVEPOINT silent_empty_test;
DO $empty$
DECLARE
 code constant text:='EMPTY77';
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 wallet constant text:='0x6666666666666666666666666666666666666666';
 inviter constant text:='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
 uid constant uuid:='00000000-0000-0000-0000-000000000097';
 t timestamptz:=clock_timestamp()-interval '1 day'; r jsonb;
BEGIN
 INSERT INTO public.invitations(id,invite_code,activation_network,reward_cohort_round_id,status,reward_status,sybil_status,invitee_wallet,eligibility_check_id,activated_at,activation_block,inviter_wallet,reward_funding_allocation_receipt_id,created_at)
 VALUES(uid,code,'mainnet',128,'ACTIVATING','PENDING','NOT_CHECKED',wallet,97,t,3000,inviter,
 (SELECT id FROM public.vebetter_round_allocations WHERE vebetter_round_id=127 AND network='mainnet'),t);
 INSERT INTO public.eligibility_check_events(id,invite_code,wallet_address,network,outcome,entry_class,checked_block)
 VALUES(97,code,wallet,'mainnet','ELIGIBLE','NEW',2990);
 UPDATE reward_admission_bridge.mission_auto_reset_settings_v1 SET enabled=true,two_round_policy_enabled=true WHERE id=1;
 SELECT public.commit_invitation_mission_auto_reset_v1(code,'mainnet',130,130,5000,5999,4999,5100) INTO r;
 IF r->>'reason' IS DISTINCT FROM 'FULL_WINDOW_PROOF_REQUIRED' THEN RAISE EXCEPTION 'silent renewal bypassed proof: %',r; END IF;
 SELECT public.record_mission_two_round_resolution_v1('mainnet',code,128,3000,3999,4000,4999,5100,'[]') INTO r;
 IF r->>'recorded' IS DISTINCT FROM 'true' OR r->>'complete' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'empty expiry proof: %',r; END IF;
 SELECT public.commit_invitation_mission_auto_reset_v1(code,'mainnet',130,130,5000,5999,4999,5100) INTO r;
 IF r->>'started' IS DISTINCT FROM 'true' OR r->>'notificationSent' IS DISTINCT FROM 'false' OR r->>'notificationId' IS NOT NULL THEN RAISE EXCEPTION 'empty original renewal: %',r; END IF;
 SELECT public.commit_invitation_mission_auto_reset_v1(code,'mainnet',130,130,5000,5999,4999,5100) INTO r;
 IF r->>'reason' IS DISTINCT FROM 'ALREADY_RESET' THEN RAISE EXCEPTION 'empty renewal replay: %',r; END IF;
 -- Seal the retry's actual following vote window before recording expiry.
 SELECT public.record_mission_auto_reset_progress_v1('mainnet',code,1,130,5000,5999,6000,6999,7200,'[]') INTO r;
 IF r->>'recorded' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'empty attempt proof: %',r; END IF;
 SELECT public.record_mission_two_round_resolution_v1('mainnet',code,130,5000,5999,6000,6999,7200,'[]') INTO r;
 IF r->>'recorded' IS DISTINCT FROM 'true' OR r->>'complete' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'empty retry expiry: %',r; END IF;
 INSERT INTO public.vebetter_round_allocations(network,app_id,vebetter_round_id,claim_block_number,observed_at,rewards_allocation_amount_wei)
 VALUES('mainnet',app,130,6000,now()-interval '2 days',100000000000000000000),
       ('mainnet',app,131,7000,now()-interval '2 days',100000000000000000000);
 SELECT public.commit_invitation_mission_auto_reset_v1(code,'mainnet',132,132,7000,7999,6999,7200) INTO r;
 IF r->>'started' IS DISTINCT FROM 'true' OR r->>'attemptNo' IS DISTINCT FROM '2' OR r->>'notificationSent' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'empty retry renewal: %',r; END IF;
 IF EXISTS(SELECT 1 FROM public.invite_notification_history WHERE invite_code=code)
 OR (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempts_v1 WHERE invite_code=code AND state='ACTIVE')<>1
 OR NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1 WHERE invite_code=code AND attempt_no=1 AND state='EXPIRED')
 OR NOT EXISTS(SELECT 1 FROM public.invitations WHERE invite_code=code AND slot_released_at IS NULL AND reward_status='PENDING')
 THEN RAISE EXCEPTION 'silent renewal altered history, slot or notices'; END IF;
END;
$empty$;
ROLLBACK TO silent_empty_test;
SELECT 'silent-empty-renewal-qa-pass' AS result;
DO $flex$
DECLARE
 code constant text:='LEGACY7';
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 wallet constant text:='0x7777777777777777777777777777777777777777';
 inviter constant text:='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
 uid constant uuid:='00000000-0000-0000-0000-000000000099';
 unit numeric:=1000000000000000000;
 t timestamptz:=clock_timestamp()-interval '1 day';
 events jsonb; r jsonb; progress jsonb; f record; q public.reward_queue_entries%rowtype;
 checks jsonb:='["HISTORICAL_CHAIN","FUNDING_CHAIN","MISSION_BEHAVIOR","SECURITY_IDENTITY","VEPASSPORT","CHAIN_FINALITY"]';
 expected_gross numeric; receipt bigint; claimrow record;
BEGIN
 expected_gross:=CASE WHEN current_setting('veinvite.qa_legacy')='1' THEN 90*unit ELSE 100*unit END;
 INSERT INTO public.invitations(id,invite_code,activation_network,reward_cohort_round_id,
   status,reward_status,sybil_status,invitee_wallet,eligibility_check_id,activated_at,
   activation_block,inviter_wallet,reward_funding_allocation_receipt_id,created_at)
 VALUES(uid,code,'mainnet',NULL,'ACTIVATING','PENDING','NOT_CHECKED',wallet,99,t,
   1000,inviter,NULL,
   CASE WHEN current_setting('veinvite.qa_legacy')='1' THEN now()-interval '60 days' ELSE now()-interval '7 days' END);
 UPDATE reward_admission_bridge.mission_auto_reset_settings_v1 SET enabled=true,two_round_policy_enabled=true WHERE id=1;
 SELECT public.commit_invitation_mission_auto_reset_v1(code,'mainnet',130,130,5000,5999,4999,5100) INTO r;
 IF r->>'reason' IS DISTINCT FROM 'INVITATION_PROTECTED' THEN RAISE EXCEPTION 'unverified legacy reset permitted: %',r; END IF;
 INSERT INTO public.eligibility_check_events(id,invite_code,wallet_address,network,outcome,entry_class,checked_block,details)
 VALUES(99,code,wallet,'mainnet','ELIGIBLE','NEW',1000,'{"legacyRecoveryKind":"FINALIZED_MAINNET_PRE_FUNDING_V1","ruleVersion":"entry-history-v3-positive-rewards-12-completed-rounds","historyScanThroughBlock":1000,"priorPositiveRewardCount":0,"priorAllocationVoteCount":0,"currentRoundId":110,"entryRoundStartBlock":900,"entryRoundEndBlock":1999,"verifiedFinalizedBlock":5100}');
 SELECT public.read_invitation_mission_retry_state_v1(code,'mainnet') INTO r;
 IF r->>'originalRoundId' IS DISTINCT FROM '110' OR r->>'state' IS DISTINCT FROM 'EXPIRED' THEN RAISE EXCEPTION 'verified legacy round not recognized: %',r; END IF;
 UPDATE reward_admission_bridge.mission_auto_reset_settings_v1 SET enabled=true,two_round_policy_enabled=true WHERE id=1;
 -- Original mission: two dApps + conversion + vote, but no third dApp.
 events:=jsonb_build_array(
   jsonb_build_object('event_type','DAPP_REWARD','app_id','0x'||repeat('a',64),'amount_wei','1','tx_id','0x'||repeat('a',64),'block_number',1100,'tx_index',0,'clause_index',0,'block_timestamp',t),
   jsonb_build_object('event_type','DAPP_REWARD','app_id','0x'||repeat('b',64),'amount_wei','1','tx_id','0x'||repeat('b',64),'block_number',1200,'tx_index',0,'clause_index',0,'block_timestamp',t+interval '1 minute'),
   jsonb_build_object('event_type','VOT3_CONVERSION','amount_wei','1','tx_id','0x'||repeat('c',64),'block_number',1300,'tx_index',0,'clause_index',0,'block_timestamp',t+interval '2 minutes'),
   jsonb_build_object('event_type','ALLOCATION_VOTE','vote_round_id',111,'tx_id','0x'||repeat('d',64),'block_number',2001,'tx_index',0,'clause_index',0,'block_timestamp',t+interval '3 minutes'));
 INSERT INTO public.invite_impact_events(invite_code,network,wallet_address,event_type,tx_id,block_number,block_timestamp,app_id,vote_round_id,amount_wei,tx_index,clause_index)
 SELECT code,'mainnet',wallet,x.event_type,x.tx_id,x.block_number,x.block_timestamp,x.app_id,x.vote_round_id,x.amount_wei,x.tx_index,x.clause_index
 FROM jsonb_to_recordset(events) AS x(event_type text,tx_id text,block_number bigint,block_timestamp timestamptz,app_id text,vote_round_id bigint,amount_wei text,tx_index bigint,clause_index bigint);
 UPDATE public.invitations SET apps_completed=2,rewards_received=2,vot3_converted=true,
  vot3_converted_at=t+interval '2 minutes',vot3_converted_block=1300,vot3_conversion_tx_id='0x'||repeat('c',64),vot3_conversion_amount_wei='1',
  vote_completed=true,vote_completed_at=t+interval '3 minutes',vote_completed_block=2001,vote_round_id=111
 WHERE invite_code=code;
 IF NOT EXISTS(SELECT 1 FROM public.invitations WHERE invite_code=code AND vote_completed=true AND reward_status='PENDING')
 THEN RAISE EXCEPTION 'original partial vote fixture invalid'; END IF;
 SELECT public.commit_invitation_mission_auto_reset_v1(code,'mainnet',130,130,5000,5999,4999,5100) INTO r;
 IF r->>'reason' IS DISTINCT FROM 'FULL_WINDOW_PROOF_REQUIRED' THEN RAISE EXCEPTION 'reset without proof: %',r; END IF;
 SELECT public.record_mission_two_round_resolution_v1('mainnet',code,110,1000,1999,2000,2999,3000,events) INTO r;
 IF r->>'reason' IS DISTINCT FROM 'WINDOW_NOT_FINALIZED' THEN RAISE EXCEPTION 'unfinalized expiry accepted: %',r; END IF;
 SELECT public.record_mission_two_round_resolution_v1('mainnet',code,110,1000,1999,2000,2999,5100,events) INTO r;
 IF r->>'recorded' IS DISTINCT FROM 'true' OR r->>'complete' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'original expiry proof: %',r; END IF;
 SELECT public.record_mission_two_round_resolution_v1('mainnet',code,126,3000,3199,3200,3399,5100,'[]') INTO r;
 IF r->>'recorded' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'missed rollout window 126: %',r; END IF;
 SELECT public.record_mission_two_round_resolution_v1('mainnet',code,128,3400,3999,4000,4999,5100,'[]') INTO r;
 IF r->>'recorded' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'missed rollout window 128: %',r; END IF;
 SELECT public.commit_invitation_mission_auto_reset_v1(code,'mainnet',130,130,5000,5999,4999,5100) INTO r;
 IF r->>'started' IS DISTINCT FROM 'true' OR r->>'notificationSent' IS DISTINCT FROM 'true' OR r->>'notificationId' IS NULL THEN RAISE EXCEPTION 'partial reset notice: %',r; END IF;
 IF (SELECT count(*) FROM public.invite_notification_history WHERE invite_code=code AND kind='MISSION_PROGRESS_RESET')<>1 THEN RAISE EXCEPTION 'partial reset notice count'; END IF;
 IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_two_round_reset_snapshot_v1 s
   JOIN reward_admission_bridge.mission_retry_attempts_v1 a ON a.id=s.attempt_id
   WHERE a.invite_code=code AND s.old_vote->>'vote_completed_block'='2001')
 OR (SELECT count(*) FROM public.invite_impact_events WHERE invite_code=code)<>4
 OR NOT EXISTS(SELECT 1 FROM public.invitations WHERE invite_code=code AND NOT vote_completed AND reward_status='PENDING' AND slot_released_at IS NULL AND reward_cohort_round_id IS NULL AND reward_funding_allocation_receipt_id IS NULL)
 THEN RAISE EXCEPTION 'original partial vote history or slot lost'; END IF;
 events:=jsonb_build_array(
   jsonb_build_object('event_type','DAPP_REWARD','app_id','0x'||repeat('1',64),'amount_wei','1','tx_id','0x'||repeat('1',64),'block_number',5100,'tx_index',0,'clause_index',0,'block_timestamp',t),
   jsonb_build_object('event_type','DAPP_REWARD','app_id','0x'||repeat('2',64),'amount_wei','1','tx_id','0x'||repeat('2',64),'block_number',5200,'tx_index',0,'clause_index',0,'block_timestamp',t+interval '1 minute'),
   jsonb_build_object('event_type','VOT3_CONVERSION','amount_wei','1','tx_id','0x'||repeat('3',64),'block_number',5300,'tx_index',0,'clause_index',0,'block_timestamp',t+interval '2 minutes'));
 events:=events||jsonb_build_array(
   jsonb_build_object('event_type','ALLOCATION_VOTE','vote_round_id',131,'tx_id','0x'||repeat('5',64),'block_number',6001,'tx_index',0,'clause_index',0,'block_timestamp',t+interval '3 minutes'));
 SELECT public.record_mission_auto_reset_progress_v1('mainnet',code,1,130,5000,5999,6000,6999,6050,events) INTO r;
 IF r->>'recorded' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'partial proof: %',r; END IF;
 SELECT public.read_mission_auto_reset_progress_v1('mainnet',ARRAY[code]) INTO progress;
 IF progress->0->>'appsCompleted' IS DISTINCT FROM '2' OR progress->0->>'voteObserved' IS DISTINCT FROM 'true'
 OR progress->0->>'voteCompleted' IS DISTINCT FROM 'false' OR progress->0->>'completionRoundId' IS NOT NULL
 THEN RAISE EXCEPTION 'partial mission wrongly complete: %',progress; END IF;
 SELECT public.bind_mission_retry_completion_v1('mainnet',code,1) INTO r;
 IF r->>'bound' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'partial binding: %',r; END IF;
 BEGIN
   PERFORM public.record_mission_auto_reset_progress_v1('mainnet',code,1,130,5000,5999,6000,6999,7200,
      jsonb_build_array(jsonb_build_object('event_type','DAPP_REWARD','app_id','0x'||repeat('4',64),'amount_wei','1','tx_id','0x'||repeat('4',64),'block_number',7000,'tx_index',0,'clause_index',0,'block_timestamp',t+interval '4 minutes')));
   RAISE EXCEPTION 'N_PLUS_TWO_ACCEPTED';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM<>'MISSION_ATTEMPT_SCAN_EVENT_INVALID' THEN RAISE; END IF;
 END;
 events:=events||jsonb_build_array(
   jsonb_build_object('event_type','DAPP_REWARD','app_id','0x'||repeat('4',64),'amount_wei','1','tx_id','0x'||repeat('4',64),'block_number',6100,'tx_index',0,'clause_index',0,'block_timestamp',t+interval '4 minutes'));
 SELECT public.record_mission_auto_reset_progress_v1('mainnet',code,1,130,5000,5999,6000,6999,7200,events) INTO r;
 IF r->>'recorded' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'late third app: %',r; END IF;
 SELECT public.record_mission_auto_reset_progress_v1('mainnet',code,1,130,5000,5999,6000,6999,7200,events) INTO r;
 IF r->>'recorded' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'retry replay: %',r; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.read_mission_retry_behavior_patterns_v1('mainnet') p WHERE p.invite_code=code AND p.attempt_no=1 AND cardinality(p.app_sequence)=3 AND cardinality(p.reward_intervals_seconds)=2)
 THEN RAISE EXCEPTION 'N+1 third dApp missing from actual Sybil behavior evidence'; END IF;
 SELECT public.record_mission_two_round_resolution_v1('mainnet',code,130,5000,5999,6000,6999,7200,events) INTO r;
 IF r->>'recorded' IS DISTINCT FROM 'true' OR r->>'complete' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'completed resolution: %',r; END IF;
 INSERT INTO public.vebetter_round_allocations(network,app_id,vebetter_round_id,claim_block_number,observed_at,rewards_allocation_amount_wei)
 VALUES('mainnet',app,130,6000,now()-interval '2 days',100*unit),
       ('mainnet',app,131,7000,now()-interval '2 days',100*unit);
 SELECT id INTO receipt FROM public.vebetter_round_allocations WHERE network='mainnet' AND vebetter_round_id=130;
 SELECT public.bind_mission_retry_completion_v1('mainnet',code,1) INTO r;
 IF r->>'bound' IS DISTINCT FROM 'true' OR r->>'completionRoundId' IS DISTINCT FROM '131'
 THEN RAISE EXCEPTION 'completion binding: %',r; END IF;
 SELECT * INTO f FROM public.read_effective_mission_reward_funding_v1(code,'mainnet');
 IF f.completion_block IS DISTINCT FROM 6100::bigint OR f.reward_cohort_round_id IS DISTINCT FROM 131::bigint
   OR f.reward_funding_allocation_receipt_id IS DISTINCT FROM receipt
 THEN RAISE EXCEPTION 'wrong final event/funding: %',f; END IF;
 SELECT public.publish_mission_retry_completion_checkpoint_v1('mainnet',code,1) INTO r;
 IF r->>'published' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'publish: %',r; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.invitations i WHERE i.invite_code=code AND i.apps_completed_block=6100
    AND i.vote_completed_block=6001 AND i.vote_round_id=131 AND i.reward_status='PENDING')
 THEN RAISE EXCEPTION 'actual vote/third app identity lost'; END IF;
 UPDATE public.invitations SET identity_link_status='NO_KNOWN_LINK',identity_link_checked_at=clock_timestamp(),
   identity_link_policy_version='security_client_v2',identity_link_evidence='{"observedClientCount":1}' WHERE invite_code=code;
 INSERT INTO public.sybil_v2_referral_assessments(invite_code,network,state,revision,evidence_cutoff_block,assessed_at,
  evidence_summary,completed_checks,required_checks,risk_score,policy_version,analyzer_version,reason_codes,source)
 VALUES(code,'mainnet','CLEAR',5,6001,clock_timestamp(),'{"missionRetryAttemptNo":1,"missionRetryCompletionBlock":6100}',
   checks,checks,0,'fixture-policy','fixture-analyzer','[]','SYSTEM');
 SELECT public.authorize_mission_retry_eligibility_v1('mainnet',code,5) INTO r;
 IF r->>'reason' IS DISTINCT FROM 'CURRENT_CLEAR_ASSESSMENT_REQUIRED' THEN RAISE EXCEPTION 'old cutoff approved: %',r; END IF;
 UPDATE public.sybil_v2_referral_assessments SET evidence_cutoff_block=7200 WHERE invite_code=code;
 SELECT public.authorize_mission_retry_eligibility_v1('mainnet',code,5) INTO r;
 IF r->>'eligible' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'fresh eligibility failed: %',r; END IF;
 SELECT public.issue_sybil_v2_reward_clearance(code,5) INTO r;
 IF r->>'issued' IS DISTINCT FROM 'true' OR r->>'verdict' IS DISTINCT FROM 'CLEAR' THEN RAISE EXCEPTION 'clearance: %',r; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.read_reward_vote_round_candidates_v1('mainnet',131) c
   WHERE c.invite_code=code AND c.completion_block=6100 AND c.reward_cohort_round_id=131)
 THEN RAISE EXCEPTION 'late completion missing from candidates'; END IF;
 UPDATE public.vote_reconcile_scan_checkpoints SET last_scanned_block=7200 WHERE network='mainnet';
 SELECT public.commit_reward_vote_round_close_batch_v1(code,'mainnet',100*unit,clock_timestamp(),7200) INTO r;
 IF r->>'mode' IS DISTINCT FROM 'ROUND_BATCH_RESERVED' OR r->>'count' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'batch: %',r; END IF;
 SELECT * INTO q FROM public.reward_queue_entries WHERE invite_code=code;
 IF q.reservation_completion_block IS DISTINCT FROM 6100::bigint OR q.reserved_amount_wei IS DISTINCT FROM expected_gross
   OR q.status IS DISTINCT FROM 'AWAITING_CLAIM' THEN RAISE EXCEPTION 'late reward queue incorrect'; END IF;
 SELECT * INTO claimrow FROM public.request_reward_claim(code,inviter);
 IF claimrow.status IS DISTINCT FROM 'QUEUED' THEN RAISE EXCEPTION 'claim failed'; END IF;
 IF public.read_reward_batch_transfer_amount_wei_v1(code) IS DISTINCT FROM 90*unit THEN RAISE EXCEPTION 'wrong base transfer'; END IF;
END;
$flex$;
SELECT 'mission-verified-legacy-no-original-funding-financial-qa-pass' AS result;
ROLLBACK;
