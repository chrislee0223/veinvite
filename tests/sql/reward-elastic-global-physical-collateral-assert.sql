-- Integration regression with synthetic VeInvite users and exact B3TR wei.
-- All changes are rolled back; never execute against Production.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_e numeric:=power(10::numeric,18);
 v_before numeric;
 v_after numeric;
 v_total numeric;
BEGIN
 SELECT public.read_outstanding_reward_liability('mainnet',v_app)::numeric INTO v_before;
 IF public.read_reward_elastic_contingent_liability_wei_v1('mainnet',v_app)<>0 THEN
   RAISE EXCEPTION 'Disabled feature put a hold on Production-style rewards'; END IF;
 UPDATE reward_admission_bridge.elastic_settlement_settings
 SET enabled=true,rollout_not_before=now()-interval '8 days',
     allow_protected_partial_settlement=true WHERE id=1;
 -- Old invite is intentionally *before rollout*; it is not a future hold.
 SELECT public.read_reward_elastic_contingent_liability_wei_v1('mainnet',v_app)
 INTO v_total;
 IF v_total<>1000*v_e THEN
   RAISE EXCEPTION 'Full future cohort commitment missing: %',v_total/v_e;
 END IF;
 SELECT public.read_outstanding_reward_liability('mainnet',v_app)::numeric INTO v_after;
 IF v_after-v_before<>1000*v_e THEN
   RAISE EXCEPTION 'Physical reserve reader failed to include future cohort: %',v_after-v_before;
 END IF;
 -- A verified reserve transfers part of the contingent hold to canonical
 -- unpaid queue. Total physical reserved money MUST NOT change.
 INSERT INTO public.reward_queue_entries(invite_code,network,reserved_amount_wei,status)
 VALUES('ELASTIC-USER1','mainnet',300*v_e,'AWAITING_CLAIM');
 SELECT public.read_reward_elastic_contingent_liability_wei_v1('mainnet',v_app)
 INTO v_total;
 IF v_total<>700*v_e THEN
   RAISE EXCEPTION 'First 300 B3TR failed to reduce contingent hold: %',v_total/v_e;
 END IF;
 SELECT public.read_outstanding_reward_liability('mainnet',v_app)::numeric INTO v_after;
 IF v_after-v_before<>1000*v_e THEN
   RAISE EXCEPTION 'Contingent-to-queue transfer double-counted or dropped physical cover';
 END IF;
 -- Queue payout completes: it leaves the pending physical reader but must
 -- still consume its cohort's gross lifetime budget.
 INSERT INTO public.reward_payouts(invite_code,status,amount_wei,round_id)
 VALUES('ELASTIC-USER1','PAID',300*v_e,11);
 UPDATE public.reward_queue_entries SET status='PAID'
 WHERE invite_code='ELASTIC-USER1';
 SELECT public.read_reward_elastic_contingent_liability_wei_v1('mainnet',v_app)
 INTO v_total;
 IF v_total<>700*v_e THEN
   RAISE EXCEPTION 'Payout was treated as unspent cohort budget: %',v_total/v_e;
 END IF;
 SELECT public.read_outstanding_reward_liability('mainnet',v_app)::numeric INTO v_after;
 IF v_after-v_before<>700*v_e THEN
   RAISE EXCEPTION 'Physical cover failed to release only the actual paid funds: %',v_after-v_before;
 END IF;
 -- A separate future funded round also retains all of its uncommitted
 -- budget: an X or base payout in round B cannot spend round A's cash.
 UPDATE public.vebetter_round_allocations
 SET rewards_allocation_amount_wei=500*v_e WHERE id=1002;
 INSERT INTO public.invitations(invite_code,activation_network,activated_at,status,
  reward_cohort_round_id,reward_funding_allocation_receipt_id)
 VALUES('ELASTIC-OTHER','mainnet',now()-interval '5 days','ACTIVATING',124,1002);
 SELECT public.read_reward_elastic_contingent_liability_wei_v1('mainnet',v_app)
 INTO v_total;
 IF v_total<>1200*v_e THEN
   RAISE EXCEPTION 'Cross-cohort budget protection missing: %',v_total/v_e;
 END IF;
 IF has_function_privilege('anon',
   'public.read_reward_elastic_contingent_liability_wei_v1(text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.read_reward_elastic_contingent_liability_wei_v1(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Wallet could call private collateral reader'; END IF;
END $test$;
ROLLBACK;
DO $post$
BEGIN
 IF (SELECT allow_protected_partial_settlement
  FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1)
 THEN RAISE EXCEPTION 'QA test leaked activation'; END IF;
 IF EXISTS (SELECT 1 FROM public.reward_queue_entries WHERE invite_code='ELASTIC-USER1')
 THEN RAISE EXCEPTION 'QA synthetic payout leaked'; END IF;
END $post$;
SELECT 'PASS global contingent collateral from 1st reservation through PAID and cross-cohort' result;
