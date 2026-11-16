\set ON_ERROR_STOP on
DO $test$
DECLARE before_state jsonb; new_state jsonb; trial jsonb; n int;
BEGIN
 before_state:=public.read_invitation_mission_retry_state_v1('C5RV7QG','mainnet');
 IF before_state->>'state'<>'EXPIRED'
   OR (before_state->>'restartEligible')::boolean IS DISTINCT FROM false
   OR before_state->>'currentRoundId'<>'125'
 THEN RAISE EXCEPTION 'old incomplete classification wrong: %',before_state; END IF;
 IF public.read_invitation_mission_retry_state_v1('EDFW4Y7','mainnet')->>'state'<>'VOTE_WINDOW'
 THEN RAISE EXCEPTION 'ongoing participant improperly expired'; END IF;
 IF public.read_invitation_mission_retry_state_v1('ACXKGKC','mainnet')->>'state'<>'COMPLETION_PROTECTED'
 THEN RAISE EXCEPTION 'completed user lost protection'; END IF;
 IF public.read_invitation_mission_retry_state_v1('ZJ6WNCE','mainnet')->>'state'<>'TERMINAL'
 THEN RAISE EXCEPTION 'blocked user not terminal'; END IF;
 IF public.read_invitation_mission_retry_state_v1('JR7D76M','mainnet')->>'state'<>'SECURITY_REVIEW'
 THEN RAISE EXCEPTION 'reviewed user not protected'; END IF;
 IF public.read_invitation_mission_retry_state_v1('WVYTYY6','mainnet')->>'state'<>'LEGACY_UNBOUND_EXPIRED_REVIEW'
 THEN RAISE EXCEPTION 'unbound legacy user falsely certified for retry'; END IF;
 trial:=public.begin_invitation_mission_retry_v1('C5RV7QG','mainnet',126,26490000,26489000,26548000);
 IF trial->>'reason'<>'FEATURE_DISABLED' THEN RAISE EXCEPTION 'disabled gate failed %',trial; END IF;
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1)
 THEN RAISE EXCEPTION 'disabled feature wrote an attempt'; END IF;
 IF has_function_privilege('anon','public.begin_invitation_mission_retry_v1(text,text,bigint,bigint,bigint,bigint)','EXECUTE')
   OR has_function_privilege('authenticated','public.read_invitation_mission_retry_state_v1(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'client has unauthorized mission retry privileges'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='reward_admission_bridge' AND c.relname='mission_retry_attempts_v1' AND c.relrowsecurity)
 THEN RAISE EXCEPTION 'attempt table RLS missing'; END IF;

 -- An isolated preview enabling the flag must still wait until valid round 126.
 UPDATE reward_admission_bridge.mission_retry_settings_v1 SET enabled=true WHERE id=1;
 IF public.read_invitation_mission_retry_state_v1('C5RV7QG','mainnet')->>'restartEligible'<>'false'
 THEN RAISE EXCEPTION 'past round permitted early retry'; END IF;
 INSERT INTO public.vebetter_round_allocations(network,app_id,vebetter_round_id,claim_block_number)
 VALUES('mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',125,26485000);
 trial:=public.begin_invitation_mission_retry_v1('C5RV7QG','mainnet',126,26490000,26489000,26548000);
 IF trial->>'started'<>'true' OR trial->>'attemptNo'<>'1'
 THEN RAISE EXCEPTION 'eligible legacy invite could not start new attempt: %',trial; END IF;
 IF public.read_invitation_mission_retry_state_v1('C5RV7QG','mainnet')->>'state'<>'DAPP_WINDOW'
 THEN RAISE EXCEPTION 'attempt not in current dapp round'; END IF;
 trial:=public.begin_invitation_mission_retry_v1('C5RV7QG','mainnet',126,26490001,26489000,26548000);
 IF trial->>'started'<>'false' OR trial->>'reason'<>'NOT_RESTART_ELIGIBLE'
 THEN RAISE EXCEPTION 'duplicate restart did not fail: %',trial; END IF;
 trial:=public.begin_invitation_mission_retry_v1('ACXKGKC','mainnet',126,26490001,26489000,26548000);
 IF trial->>'started'<>'false' THEN RAISE EXCEPTION 'completed referral was restarted'; END IF;
 trial:=public.begin_invitation_mission_retry_v1('ZJ6WNCE','mainnet',126,26490001,26489000,26548000);
 IF trial->>'started'<>'false' THEN RAISE EXCEPTION 'blocked referral was restarted'; END IF;
 trial:=public.begin_invitation_mission_retry_v1('WVYTYY6','mainnet',126,26490001,26489000,26548000);
 IF trial->>'started'<>'false' THEN RAISE EXCEPTION 'unbound legacy entry bypassed verification'; END IF;

 INSERT INTO public.vebetter_round_allocations(network,app_id,vebetter_round_id,claim_block_number)
 VALUES('mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',126,26555000);
 IF public.read_invitation_mission_retry_state_v1('C5RV7QG','mainnet')->>'state'<>'VOTE_WINDOW'
 THEN RAISE EXCEPTION 'next-round voting window was skipped'; END IF;
 trial:=public.begin_invitation_mission_retry_v1('C5RV7QG','mainnet',127,26590000,26589000,26648000);
 IF trial->>'started'<>'false' OR trial->>'reason'<>'NOT_RESTART_ELIGIBLE'
 THEN RAISE EXCEPTION 'unexpired ongoing vote attempt restarted prematurely'; END IF;
 INSERT INTO public.vebetter_round_allocations(network,app_id,vebetter_round_id,claim_block_number)
 VALUES('mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',127,26620000);
 IF public.read_invitation_mission_retry_state_v1('C5RV7QG','mainnet')->>'state'<>'EXPIRED'
 THEN RAISE EXCEPTION 'missed vote did not expire'; END IF;
 trial:=public.begin_invitation_mission_retry_v1('C5RV7QG','mainnet',128,26690000,26689000,26748000);
 IF trial->>'started'<>'true' OR trial->>'attemptNo'<>'2'
 THEN RAISE EXCEPTION 'second lawful attempt not created: %',trial; END IF;
 SELECT count(*) INTO n FROM reward_admission_bridge.mission_retry_attempts_v1
 WHERE invite_code='C5RV7QG' AND state='EXPIRED';
 IF n<>1 THEN RAISE EXCEPTION 'old attempt history not preserved'; END IF;
 SELECT count(*) INTO n FROM reward_admission_bridge.mission_retry_attempts_v1
 WHERE invite_code='C5RV7QG' AND state='ACTIVE';
 IF n<>1 THEN RAISE EXCEPTION 'duplicate active attempt'; END IF;
 IF EXISTS(SELECT 1 FROM public.reward_queue_entries) OR EXISTS(SELECT 1 FROM public.reward_payouts)
 THEN RAISE EXCEPTION 'attempt ledger unexpectedly created financial records'; END IF;
 IF (SELECT count(*) FROM public.invitations)<>6
 THEN RAISE EXCEPTION 'original invitation rows mutated'; END IF;
 IF (SELECT reward_cohort_round_id FROM public.invitations WHERE invite_code='C5RV7QG')<>120
 THEN RAISE EXCEPTION 'original funding lineage changed'; END IF;
END;
$test$;
SELECT 'PASS: legacy windows, no new notifications, disabled-by-default, bounded restart, immutable payouts, block/review/paid protection' AS result;
