-- Disposable PostgreSQL 17 only: SQL failure cannot consume a promise.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.invitations(
 invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,
 activation_network,status,sybil_status)
VALUES('HANDOFF-ERROR',123,1001,'mainnet','COMPLETED','CLEAR');
INSERT INTO reward_admission_bridge.holds(
 network,invite_code,app_id,reward_cohort_round_id,
 funding_allocation_receipt_id,amount_wei,status)
VALUES('mainnet','HANDOFF-ERROR',
'0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
123,1001,6*power(10::numeric,18),'HELD');
-- Fake downstream DB outage when the core attempts to create fixed payout.
ALTER TABLE public.reward_queue_entries ADD CONSTRAINT fake_core_fail_only
 CHECK(invite_code <> 'HANDOFF-ERROR');
DO $test$
DECLARE e numeric:=power(10::numeric,18);
BEGIN
 BEGIN
  PERFORM reward_admission_bridge.commit_held_to_fixed_v1(
    'HANDOFF-ERROR','mainnet',100*e,28*e,6*e,'qa',null,100,
    jsonb_build_object('cohortReservedWei',(36*e)::text));
  RAISE EXCEPTION 'INJECTED_FAILURE_NOT_PROPAGATED';
 EXCEPTION WHEN check_violation THEN
  IF (SELECT status FROM reward_admission_bridge.holds WHERE invite_code='HANDOFF-ERROR') <> 'HELD'
    OR EXISTS(SELECT 1 FROM public.reward_queue_entries WHERE invite_code='HANDOFF-ERROR')
  THEN RAISE EXCEPTION 'Core SQL outage consumed or duplicated held funds'; END IF;
 END;
END $test$;
ROLLBACK;
BEGIN;
INSERT INTO public.invitations(
 invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,
 activation_network,status,sybil_status)
VALUES('HANDOFF-MISMATCH',124,1001,'mainnet','COMPLETED','CLEAR');
INSERT INTO reward_admission_bridge.holds(
 network,invite_code,app_id,reward_cohort_round_id,
 funding_allocation_receipt_id,amount_wei,status)
VALUES('mainnet','HANDOFF-MISMATCH',
'0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
123,1001,6*power(10::numeric,18),'HELD');
DO $test$
DECLARE v jsonb;e numeric:=power(10::numeric,18);
BEGIN
 SELECT reward_admission_bridge.commit_held_to_fixed_v1(
    'HANDOFF-MISMATCH','mainnet',100*e,28*e,6*e,'qa',null,100,
    jsonb_build_object('cohortReservedWei',(36*e)::text)) INTO v;
 IF v->>'reason'<>'FUNDING_RECEIPT_MISMATCH'
 THEN RAISE EXCEPTION 'Wrong fund receipt accepted: %',v; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS core SQL outage rolls back HELD and wrong receipt is refused' result;
