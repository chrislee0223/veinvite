-- Disposable PostgreSQL 17 ONLY. Never run against Production.
-- A fake downstream writer that advertises RECOVERY_PARTIAL_RESERVED but
-- posts an INACTIVE settlement or inconsistent offset must fail closed.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.invitations(invite_code,reward_cohort_round_id,
 reward_funding_allocation_receipt_id,activation_network,status,
 sybil_status,mock_recovery_offset_wei)
VALUES ('HANDOFF-INACTIVE',123,1001,'mainnet','COMPLETED','CLEAR',
 2*power(10::numeric,18));
INSERT INTO reward_admission_bridge.holds(network,invite_code,app_id,
 reward_cohort_round_id,funding_allocation_receipt_id,amount_wei,status)
VALUES ('mainnet','HANDOFF-INACTIVE',
 '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
 123,1001,6*power(10::numeric,18),'HELD');
DO $qa$
DECLARE v_error text; e numeric:=power(10::numeric,18);
BEGIN
 BEGIN
  PERFORM reward_admission_bridge.commit_held_to_fixed_v1(
    'HANDOFF-INACTIVE','mainnet',100*e,28*e,7*e,'qa',null,100,
    jsonb_build_object('cohortReservedWei',(36*e)::text));
  RAISE EXCEPTION 'EXPECTED_REJECTION_MISSING';
 EXCEPTION WHEN others THEN
  GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
  IF v_error<>'ADMISSION_HANDOFF_RECOVERY_PROOF_INVALID'
    THEN RAISE EXCEPTION 'Unexpected recovery decision: %',v_error; END IF;
 END;
 IF (SELECT status FROM reward_admission_bridge.holds
     WHERE invite_code='HANDOFF-INACTIVE')<>'HELD'
 OR EXISTS(SELECT 1 FROM public.reward_recovery_settlements
     WHERE invite_code='HANDOFF-INACTIVE')
 OR EXISTS(SELECT 1 FROM public.reward_queue_entries
     WHERE invite_code='HANDOFF-INACTIVE')
 THEN RAISE EXCEPTION 'Inactive recovery left a partial database commit'; END IF;
END $qa$;
ROLLBACK;

BEGIN;
INSERT INTO public.invitations(invite_code,reward_cohort_round_id,
 reward_funding_allocation_receipt_id,activation_network,status,
 sybil_status,mock_recovery_offset_wei)
VALUES ('HANDOFF-WRONG-OFFSET',123,1001,'mainnet','COMPLETED','CLEAR',
 2*power(10::numeric,18));
INSERT INTO reward_admission_bridge.holds(network,invite_code,app_id,
 reward_cohort_round_id,funding_allocation_receipt_id,amount_wei,status)
VALUES ('mainnet','HANDOFF-WRONG-OFFSET',
 '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
 123,1001,6*power(10::numeric,18),'HELD');
DO $qa$
DECLARE v_error text; e numeric:=power(10::numeric,18);
BEGIN
 BEGIN
  PERFORM reward_admission_bridge.commit_held_to_fixed_v1(
    'HANDOFF-WRONG-OFFSET','mainnet',100*e,28*e,7*e,'qa',null,100,
    jsonb_build_object('cohortReservedWei',(36*e)::text));
  RAISE EXCEPTION 'EXPECTED_REJECTION_MISSING';
 EXCEPTION WHEN others THEN
  GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
  IF v_error<>'ADMISSION_HANDOFF_RECOVERY_PROOF_INVALID'
    THEN RAISE EXCEPTION 'Wrong-offset decision incorrect: %',v_error; END IF;
 END;
 IF (SELECT status FROM reward_admission_bridge.holds
     WHERE invite_code='HANDOFF-WRONG-OFFSET')<>'HELD'
 OR EXISTS(SELECT 1 FROM public.reward_recovery_settlements
     WHERE invite_code='HANDOFF-WRONG-OFFSET')
 OR EXISTS(SELECT 1 FROM public.reward_queue_entries
     WHERE invite_code='HANDOFF-WRONG-OFFSET')
 THEN RAISE EXCEPTION 'Wrong-offset recovery committed duplicate funds'; END IF;
END $qa$;
ROLLBACK;
SELECT 'PASS: ACTIVE exact recovery gross-offset-net required; corrupt writer rolled back' AS result;
