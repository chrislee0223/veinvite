-- Fake PostgreSQL 17 ONLY. Verify Production-style gate remains off.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.invitations(invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,activation_network,status,sybil_status)
VALUES('HANDOFF-DRY',123,1001,'mainnet','COMPLETED','CLEAR');
INSERT INTO reward_admission_bridge.holds(network,invite_code,app_id,reward_cohort_round_id,funding_allocation_receipt_id,amount_wei,status)
VALUES('mainnet','HANDOFF-DRY','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',123,1001,6*power(10::numeric,18),'HELD');
DO $test$
DECLARE v jsonb;e numeric:=power(10::numeric,18);
BEGIN
 SELECT reward_admission_bridge.commit_held_to_fixed_v1(
  'HANDOFF-DRY','mainnet',100*e,28*e,6*e,'qa',null,100,
  jsonb_build_object('cohortReservedWei',(36*e)::text)) INTO v;
 IF v->>'reason'<>'ADMISSION_HANDOFF_DISABLED'
  OR (SELECT status FROM reward_admission_bridge.holds WHERE invite_code='HANDOFF-DRY')<>'HELD'
  OR EXISTS(SELECT 1 FROM public.reward_queue_entries WHERE invite_code='HANDOFF-DRY')
 THEN RAISE EXCEPTION 'Disabled handoff mutated a funded liability'; END IF;
 IF has_function_privilege('anon','reward_admission_bridge.commit_held_to_fixed_v1(text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','reward_admission_bridge.commit_held_to_fixed_v1(text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb)','EXECUTE')
  OR has_function_privilege('service_role','reward_admission_bridge.commit_held_to_fixed_v1(text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Unapproved role can execute handoff'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS disabled writer and zero privilege' as result;
