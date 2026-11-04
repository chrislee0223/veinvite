-- Disposable CI PostgreSQL 17 only. All addresses, balances and invites are FAKE.
-- Model accounting across admission -> Claim states -> PAID, and X release.
-- This does NOT send real tokens, verify a live wallet, or call a real X API.
\set ON_ERROR_STOP on

-- Existing isolated handoff suite temporarily unlocks its *fake* settings.
-- Production and Preview settings retain CHECK(enabled=false).
DO $guard$
BEGIN
 IF (SELECT enabled FROM reward_admission_bridge.settings WHERE id=1) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Fake isolated handoff gate was not prepared'; END IF;
END $guard$;

BEGIN;
INSERT INTO public.invitations
 (invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,
  activation_network,status,sybil_status)
VALUES ('HANDOFF-CLAIM-X',123,1001,'mainnet','COMPLETED','CLEAR');

INSERT INTO reward_admission_bridge.holds
 (network,invite_code,app_id,reward_cohort_round_id,
  funding_allocation_receipt_id,amount_wei,status)
VALUES ('mainnet','HANDOFF-CLAIM-X',
 '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
 123,1001,6*power(10::numeric,18),'HELD');

DO $test$
DECLARE
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 e numeric:=power(10::numeric,18);
 v jsonb;
BEGIN
 -- Before conversion: old unpaid base, LIVE X and the new HELD are
 -- one physical obligation each; PAID X stays in cohort lifetime.
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>28*e
    OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>36*e
 THEN RAISE EXCEPTION 'Initial base/X/HELD funding is inconsistent'; END IF;
 SELECT reward_admission_bridge.commit_held_to_fixed_v1(
   'HANDOFF-CLAIM-X','mainnet',100*e,28*e,6*e,'fake-qa',
   null,100,jsonb_build_object('cohortReservedWei',(36*e)::text)
 ) INTO v;
 IF v->>'reserved'<>'true' OR v->>'netPayableWei'<>(6*e)::text
 THEN RAISE EXCEPTION 'Claim-ready conversion failed: %',v; END IF;

 -- The fixed reservation is still unpaid throughout Claim and queued
 -- transfer preparation. Neither state step can duplicate its liability.
 UPDATE public.reward_queue_entries
   SET status='QUEUED' WHERE invite_code='HANDOFF-CLAIM-X';
 IF NOT FOUND THEN RAISE EXCEPTION 'Claim transition lacks reserved queue'; END IF;
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>28*e
    OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>36*e
 THEN RAISE EXCEPTION 'Claim QUEUED changed financial authority'; END IF;
 UPDATE public.reward_queue_entries
   SET status='ASSIGNED' WHERE invite_code='HANDOFF-CLAIM-X';
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>28*e
    OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>36*e
 THEN RAISE EXCEPTION 'Claim ASSIGNED counted payout twice'; END IF;

 -- Fake canonical PAID is recorded only after simulated transfer finality.
 INSERT INTO public.reward_payouts(invite_code,status,amount_wei,round_id)
 VALUES('HANDOFF-CLAIM-X','PAID',6*e,11);
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>22*e
    OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>36*e
 THEN RAISE EXCEPTION 'PAID failed to release only the physical liability'; END IF;

 -- X opportunity RELEASED (not PAID) is a forfeited, nonspendable
 -- obligation: both remaining physical and cohort lifetime drop once.
 UPDATE public.reward_x_promotion_obligations
 SET financial_state='RELEASED' WHERE id=1 AND financial_state='HELD';
 IF NOT FOUND THEN RAISE EXCEPTION 'Expected initial LIVE HELD X fixture'; END IF;
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>12*e
    OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>26*e
 THEN RAISE EXCEPTION 'X RELEASED left stranded or double-counted liability'; END IF;
 -- Repeating the same expiration must be idempotent.
 UPDATE public.reward_x_promotion_obligations
 SET financial_state='RELEASED' WHERE id=1 AND financial_state='HELD';
 IF FOUND OR public.read_outstanding_reward_liability('mainnet',app)::numeric<>12*e
 THEN RAISE EXCEPTION 'X RELEASED replay changed balances'; END IF;

 -- Converted holds can never be spent twice, even after Claim & X changes.
 SELECT reward_admission_bridge.commit_held_to_fixed_v1(
   'HANDOFF-CLAIM-X','mainnet',100*e,12*e,6*e,'fake-qa',
   null,100,jsonb_build_object('cohortReservedWei',(26*e)::text)
 ) INTO v;
 IF v->>'reason'<>'HOLD_ALREADY_CONSUMED'
    OR (SELECT count(*) FROM public.reward_queue_entries
        WHERE invite_code='HANDOFF-CLAIM-X')<>1
 THEN RAISE EXCEPTION 'Post-Claim replay admitted a second obligation: %',v; END IF;
END $test$;
ROLLBACK;

-- Partial recovery changes NET spendable but not GROSS cohort commitment.
BEGIN;
INSERT INTO public.invitations
 (invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,
  activation_network,status,sybil_status,mock_recovery_offset_wei)
VALUES ('HANDOFF-CLAIM-RECOVERY',123,1001,'mainnet','COMPLETED','CLEAR',
        2*power(10::numeric,18));
INSERT INTO reward_admission_bridge.holds
 (network,invite_code,app_id,reward_cohort_round_id,
  funding_allocation_receipt_id,amount_wei,status)
VALUES ('mainnet','HANDOFF-CLAIM-RECOVERY',
 '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
 123,1001,6*power(10::numeric,18),'HELD');
DO $test$
DECLARE
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 e numeric:=power(10::numeric,18);
 v jsonb;
BEGIN
 SELECT reward_admission_bridge.commit_held_to_fixed_v1(
 'HANDOFF-CLAIM-RECOVERY','mainnet',100*e,28*e,7*e,'fake-qa',
 null,100,jsonb_build_object('cohortReservedWei',(36*e)::text)) INTO v;
 IF v->>'reason'<>'RECOVERY_PARTIAL_RESERVED'
    OR v->>'grossCommittedWei'<>'7000000000000000000'
    OR v->>'netPayableWei'<>'5000000000000000000'
 THEN RAISE EXCEPTION 'Partial gross/net conversion is not exact: %',v; END IF;
 UPDATE public.reward_queue_entries
 SET status='QUEUED' WHERE invite_code='HANDOFF-CLAIM-RECOVERY';
 UPDATE public.reward_queue_entries
 SET status='ASSIGNED' WHERE invite_code='HANDOFF-CLAIM-RECOVERY';
 INSERT INTO public.reward_payouts(invite_code,status,amount_wei,round_id)
 VALUES('HANDOFF-CLAIM-RECOVERY','PAID',5*e,11);
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>22*e
    OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>37*e
 THEN RAISE EXCEPTION 'Claim with recovery incorrectly paid GROSS or lost offset'; END IF;
END $test$;
ROLLBACK;

SELECT 'PASS: simulated Claim lifecycle, X release replay, admission replay and recovery NET/GROSS remain exact' AS result;
