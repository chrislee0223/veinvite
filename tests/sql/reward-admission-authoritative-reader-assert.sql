-- Standalone PostgreSQL 17 fake schema replay, NEVER Production.
-- Original canonical read functions are installed by canonical-reader-fixture.
-- This test verifies that even when prospective holds exist, the old base/X
-- signer sees them once, while the disarmed staging bridge remains consistent.
\set ON_ERROR_STOP on
DO $qa$
DECLARE
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 e numeric(78,0):=power(10::numeric,18);
 v jsonb;
BEGIN
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>22*e
    OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>30*e
 THEN RAISE EXCEPTION 'Original base/X/recovery reader baseline unexpectedly changed'; END IF;

 INSERT INTO reward_admission_bridge.holds(network,invite_code,app_id,
   reward_cohort_round_id,funding_allocation_receipt_id,amount_wei,status)
 VALUES('mainnet','FUTURE-LAB-HELD',app,123,1001,6*e,'HELD');
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>28*e
   OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>36*e
 THEN RAISE EXCEPTION 'HELD not protected in canonical base/X signing and cohort quote'; END IF;

 SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001)
 INTO v;
 IF (v->>'physicalBaseAndXOutstandingWei')::numeric<>22*e
   OR (v->>'unconvertedGlobalHoldsWei')::numeric<>6*e
   OR (v->>'globalLiabilityIncludingHoldsWei')::numeric<>28*e
   OR (v->>'existingCohortLifetimeCommittedWei')::numeric<>30*e
   OR (v->>'cohortLifetimePlusHoldsWei')::numeric<>36*e
   OR (v->>'enabled')::boolean OR (v->>'canAdmit')::boolean
 THEN RAISE EXCEPTION 'Staged diagnostic double counts held amount or unexpectedly enables admission: %',v; END IF;

 -- Once the same HELD becomes an actual fixed reservation, conversion is
 -- exactly once and does not inflate either physical or lifetime accounting.
 INSERT INTO public.invitations
   (invite_code,reward_funding_allocation_receipt_id,reward_cohort_round_id)
 VALUES ('FUTURE-LAB-HELD',1001,123);
 INSERT INTO public.reward_queue_entries
   (invite_code,network,reserved_amount_wei,status)
 VALUES ('FUTURE-LAB-HELD','mainnet',6*e,'AWAITING_CLAIM');
 UPDATE reward_admission_bridge.holds SET status='CONVERTED'
 WHERE invite_code='FUTURE-LAB-HELD';
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>28*e
   OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>36*e
 THEN RAISE EXCEPTION 'HELD conversion double counted or forfeited one party'; END IF;

 SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO v;
 IF (v->>'unconvertedGlobalHoldsWei')::numeric<>0
    OR (v->>'globalLiabilityIncludingHoldsWei')::numeric<>28*e
 THEN RAISE EXCEPTION 'Staging observable reader disagrees with canonical fixed settlement'; END IF;

 -- PAID stays lifetime spent but releases ONLY physical outstanding.
 INSERT INTO public.reward_payouts VALUES
   ('FUTURE-LAB-HELD','PAID',6*e,11);
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>22*e
   OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>36*e
 THEN RAISE EXCEPTION 'HELD-to-PAID prematurely erased lifetime commitment'; END IF;

 UPDATE public.reward_x_promotion_obligations SET financial_state='PAID' WHERE id=1;
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>12*e
   OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>36*e
 THEN RAISE EXCEPTION 'LIVE X PAID erased lifetime or was counted twice'; END IF;
END $qa$;
DO $qa$
BEGIN
 IF (SELECT enabled FROM reward_admission_bridge.settings WHERE id=1)
   OR has_table_privilege('service_role','reward_admission_bridge.holds','INSERT')
   OR has_function_privilege('anon','public.read_reward_admission_bridge_status_v1(text,text,bigint,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'Unfunded future admissions unexpectedly activated'; END IF;
END $qa$;
SELECT 'PASS: canonical base/X outstanding includes HELD exactly once; conversion, finalized PAID, and disabled safety gate intact' result;
