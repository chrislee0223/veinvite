-- Exact GROSS lifetime and NET physical recovered B3TR; fake isolated QA.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.invitations(invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,activation_network,status,sybil_status,mock_recovery_offset_wei)
VALUES ('HANDOFF-PARTIAL',123,1001,'mainnet','COMPLETED','CLEAR',2*power(10::numeric,18));
INSERT INTO reward_admission_bridge.holds(network,invite_code,app_id,reward_cohort_round_id,funding_allocation_receipt_id,amount_wei,status)
VALUES ('mainnet','HANDOFF-PARTIAL','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',123,1001,6*power(10::numeric,18),'HELD');
DO $test$
DECLARE v jsonb;e numeric:=power(10::numeric,18);
app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
BEGIN
 SELECT reward_admission_bridge.commit_held_to_fixed_v1('HANDOFF-PARTIAL','mainnet',100*e,28*e,7*e,'lab',null,100,jsonb_build_object('cohortReservedWei',(36*e)::text)) INTO v;
 IF v->>'reason'<>'RECOVERY_PARTIAL_RESERVED' OR v->>'netPayableWei'<>(5*e)::text
 THEN RAISE EXCEPTION 'Partial recovery result mismatch: %',v; END IF;
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>27*e
   OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>37*e
   OR (SELECT status FROM reward_admission_bridge.holds WHERE invite_code='HANDOFF-PARTIAL')<>'CONVERTED'
 THEN RAISE EXCEPTION 'Partial offset changed GROSS or NET incorrectly'; END IF;
END $test$;
ROLLBACK;
BEGIN;
INSERT INTO public.invitations(invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,activation_network,status,sybil_status,mock_recovery_offset_wei)
VALUES ('HANDOFF-FULL',123,1001,'mainnet','COMPLETED','CLEAR',6*power(10::numeric,18));
INSERT INTO reward_admission_bridge.holds(network,invite_code,app_id,reward_cohort_round_id,funding_allocation_receipt_id,amount_wei,status)
VALUES ('mainnet','HANDOFF-FULL','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',123,1001,6*power(10::numeric,18),'HELD');
DO $test$
DECLARE v jsonb;e numeric:=power(10::numeric,18);
app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
BEGIN
 SELECT reward_admission_bridge.commit_held_to_fixed_v1('HANDOFF-FULL','mainnet',100*e,28*e,6*e,'lab',null,100,jsonb_build_object('cohortReservedWei',(36*e)::text)) INTO v;
 IF v->>'reason'<>'RECOVERY_FULLY_SETTLED' OR v->>'netPayableWei'<>'0'
   OR EXISTS(SELECT 1 FROM public.reward_queue_entries WHERE invite_code='HANDOFF-FULL')
 THEN RAISE EXCEPTION 'Full offset created fictitious payable: %',v; END IF;
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>22*e
    OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>36*e
 THEN RAISE EXCEPTION 'Full recovery released GROSS lifetime or stole physical reserve'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS partial and full offset preserve GROSS vs NET ledgers' result;
