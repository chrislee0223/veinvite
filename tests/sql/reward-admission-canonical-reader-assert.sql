-- Assert the exact Production financial read function definitions using
-- exclusively fake local PostgreSQL 17 rows. NOT a Production mutation.
\set ON_ERROR_STOP on
TRUNCATE reward_admission_bridge.holds;
DO $qa$
DECLARE j jsonb;
  app constant text := '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  e numeric(78,0) := power(10::numeric,18);
BEGIN
  SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO j;
  -- Mainnet canonical unpaid: base 5 + unfixed legacy 7 + LIVE X HELD 10.
  -- PAID base 3 does not owe physical B3TR again. LIVE X PAID 10 is not
  -- physically outstanding. SHADOW and RELEASED are excluded.
  IF (j->>'physicalBaseAndXOutstandingWei')::numeric<>22*e
    OR (j->>'xLiveUnpaidAlreadyIncludedWei')::numeric<>10*e
    OR (j->>'globalLiabilityIncludingHoldsWei')::numeric<>22*e
    OR (j->>'existingCohortLifetimeCommittedWei')::numeric<>30*e
    OR (j->>'cohortEffectiveBudgetWei')::numeric<>100*e
    OR NOT (j->>'accountingConsistent')::boolean
    OR (j->>'enabled')::boolean OR (j->>'canAdmit')::boolean
    OR (j->>'canSign')::boolean OR (j->>'authorizesWrite')::boolean
  THEN RAISE EXCEPTION 'Actual Production readers disagree with canonical X/base/paid/recovery math: %',j; END IF;

  -- Future HELD must only add to the *private staged diagnostic*. The
  -- deployed base signer and payout still do not know that new hold exists.
  INSERT INTO reward_admission_bridge.holds(network,invite_code,app_id,
    reward_cohort_round_id,funding_allocation_receipt_id,amount_wei,status)
  VALUES('mainnet','LAB-NEW-HOLD',app,123,1001,6*e,'HELD');
  SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO j;
  IF (j->>'physicalBaseAndXOutstandingWei')::numeric<>22*e
    OR (j->>'unconvertedGlobalHoldsWei')::numeric<>6*e
    OR (j->>'unconvertedCohortHoldsWei')::numeric<>6*e
    OR (j->>'globalLiabilityIncludingHoldsWei')::numeric<>28*e
    OR (j->>'cohortLifetimePlusHoldsWei')::numeric<>36*e
    OR (j->>'canGuarantee')::boolean
  THEN RAISE EXCEPTION 'Actual reader and staged holds overlap or escaped the disabled gate: %',j; END IF;

  -- Canonical PAID history leaves the lifetime charge unchanged, but paid
  -- fixed rewards must be removed from *physical* outstanding liability.
  INSERT INTO public.reward_payouts VALUES
    ('LAB-UNPAID','PAID',5*e,11);
  SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO j;
  IF (j->>'physicalBaseAndXOutstandingWei')::numeric<>17*e
     OR (j->>'xLiveUnpaidAlreadyIncludedWei')::numeric<>10*e
     OR (j->>'existingCohortLifetimeCommittedWei')::numeric<>30*e
     OR (j->>'globalLiabilityIncludingHoldsWei')::numeric<>23*e
  THEN RAISE EXCEPTION 'Actual base PAID transition double charged or lost cohort lifetime: %',j; END IF;

  UPDATE public.reward_x_promotion_obligations SET financial_state='PAID' WHERE id=1;
  SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO j;
  IF (j->>'physicalBaseAndXOutstandingWei')::numeric<>7*e
    OR (j->>'xLiveUnpaidAlreadyIncludedWei')::numeric<>0
    OR (j->>'existingCohortLifetimeCommittedWei')::numeric<>30*e
    OR (j->>'globalLiabilityIncludingHoldsWei')::numeric<>13*e
  THEN RAISE EXCEPTION 'Actual LIVE X PAID transition double counted or erased lifetime: %',j; END IF;

  -- Over-commit detected from original current cohort receipt, never funded.
  UPDATE reward_admission_bridge.holds SET amount_wei=90*e
   WHERE invite_code='LAB-NEW-HOLD';
  SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO j;
  IF (j->>'accountingConsistent')::boolean
     OR (j->>'canAdmit')::boolean OR (j->>'canSign')::boolean
  THEN RAISE EXCEPTION 'Oversubscribed original cohort was presented as safe: %',j; END IF;

  -- Restore the ephemeral lab-only test state.
  TRUNCATE reward_admission_bridge.holds;
END $qa$;

DO $qa$
DECLARE j jsonb;
 app constant text := '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
BEGIN
  BEGIN
   SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,124,1001) INTO j;
   RAISE EXCEPTION 'BAD_RECEIPT_SCOPE_ACCEPTED';
  EXCEPTION WHEN others THEN
   IF SQLERRM='BAD_RECEIPT_SCOPE_ACCEPTED' THEN RAISE; END IF;
  END;
  BEGIN
   SELECT public.read_outstanding_reward_liability('mainnet','bad-app') INTO STRICT j;
   RAISE EXCEPTION 'BAD_APP_ACCEPTED';
  EXCEPTION WHEN others THEN
   IF SQLERRM='BAD_APP_ACCEPTED' THEN RAISE; END IF;
  END;
  IF has_function_privilege('anon',
      'public.read_reward_admission_bridge_status_v1(text,text,bigint,bigint)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.read_reward_admission_bridge_status_v1(text,text,bigint,bigint)','EXECUTE')
  THEN RAISE EXCEPTION 'Staged bridge privilege regression'; END IF;
END $qa$;
SELECT 'PASS: exact Production canonical accounting readers + disabled admission staging + LIVE X PAID/base PAID/recovery/legacy without double count' result;
