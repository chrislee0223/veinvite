-- Disposable PostgreSQL-only success / failure regression.
\set ON_ERROR_STOP on
UPDATE reward_admission_bridge.settings SET enabled=true WHERE id=1;
BEGIN;
INSERT INTO public.invitations(invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,activation_network,status,sybil_status)
VALUES ('HANDOFF-SIMPLE',123,1001,'mainnet','COMPLETED','CLEAR');
INSERT INTO reward_admission_bridge.holds(network,invite_code,app_id,reward_cohort_round_id,funding_allocation_receipt_id,amount_wei,status)
VALUES ('mainnet','HANDOFF-SIMPLE','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',123,1001,6*power(10::numeric,18),'HELD');
DO $test$
DECLARE v jsonb;e numeric:=power(10::numeric,18);
app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
BEGIN
 SELECT reward_admission_bridge.commit_held_to_fixed_v1('HANDOFF-SIMPLE','mainnet',100*e,28*e,5*e,'lab',null,100,jsonb_build_object('cohortReservedWei',(36*e)::text)) INTO v;
 IF v->>'reason'<>'GROSS_BELOW_HELD_MINIMUM' THEN RAISE EXCEPTION 'Guaranteed floor reduced: %',v; END IF;
 SELECT reward_admission_bridge.commit_held_to_fixed_v1('HANDOFF-SIMPLE','mainnet',100*e,0,6*e,'lab',null,100,jsonb_build_object('cohortReservedWei',(36*e)::text)) INTO v;
 IF v->>'reason'<>'RECALCULATE' THEN RAISE EXCEPTION 'Stale quote allowed: %',v; END IF;
 UPDATE public.invitations SET sybil_status='REVIEW' WHERE invite_code='HANDOFF-SIMPLE';
 SELECT reward_admission_bridge.commit_held_to_fixed_v1('HANDOFF-SIMPLE','mainnet',100*e,28*e,6*e,'lab',null,100,jsonb_build_object('cohortReservedWei',(36*e)::text)) INTO v;
 IF v->>'reason'<>'SYBIL_OR_COMPLETION_PENDING' OR (SELECT status FROM reward_admission_bridge.holds WHERE invite_code='HANDOFF-SIMPLE')<>'HELD'
 THEN RAISE EXCEPTION 'Rejected Sybil released held guarantee: %',v; END IF;
 UPDATE public.invitations SET sybil_status='CLEAR' WHERE invite_code='HANDOFF-SIMPLE';
 SELECT reward_admission_bridge.commit_held_to_fixed_v1('HANDOFF-SIMPLE','mainnet',27*e,28*e,6*e,'lab',null,100,jsonb_build_object('cohortReservedWei',(36*e)::text)) INTO v;
 IF v->>'reason'<>'UNDERFUNDED' OR (SELECT status FROM reward_admission_bridge.holds WHERE invite_code='HANDOFF-SIMPLE')<>'HELD'
 THEN RAISE EXCEPTION 'Failed funding mutated HELD: %',v; END IF;
 SELECT reward_admission_bridge.commit_held_to_fixed_v1('HANDOFF-SIMPLE','mainnet',100*e,28*e,6*e,'lab',null,100,jsonb_build_object('cohortReservedWei',(36*e)::text)) INTO v;
 IF v->>'reason'<>'RESERVED' OR v->>'admissionHandoff'<>'true' OR v->>'netPayableWei'<>(6*e)::text
 THEN RAISE EXCEPTION 'Atomic fixed transition failed: %',v; END IF;
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>28*e
   OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>36*e
   OR (SELECT status FROM reward_admission_bridge.holds WHERE invite_code='HANDOFF-SIMPLE')<>'CONVERTED'
 THEN RAISE EXCEPTION 'Fixed transition counted original hold twice'; END IF;
 SELECT reward_admission_bridge.commit_held_to_fixed_v1('HANDOFF-SIMPLE','mainnet',100*e,28*e,6*e,'lab',null,100,jsonb_build_object('cohortReservedWei',(36*e)::text)) INTO v;
 IF v->>'reason'<>'HOLD_ALREADY_CONSUMED' THEN RAISE EXCEPTION 'Replay created a second fixed reward: %',v; END IF;
 INSERT INTO public.reward_payouts(invite_code,status,amount_wei,round_id) VALUES('HANDOFF-SIMPLE','PAID',6*e,11);
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>22*e OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>36*e
 THEN RAISE EXCEPTION 'PAID erased cohort lifetime or remained unpaid'; END IF;
 UPDATE public.reward_x_promotion_obligations SET financial_state='PAID' WHERE id=1;
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>12*e OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>36*e
 THEN RAISE EXCEPTION 'X PAID incorrectly counted or erased lifetime'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS fixed handoff, Sybil, insufficiency, replay, PAID and X' result;
