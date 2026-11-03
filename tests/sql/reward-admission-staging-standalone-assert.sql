\set ON_ERROR_STOP on
DO $qa$
DECLARE
  app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  e numeric(78,0):=power(10::numeric,18);
  j jsonb;
BEGIN
  SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO j;
  IF j->>'model'<>'staged-disabled-v1' OR
    (j->>'enabled')::boolean OR (j->>'canAdmit')::boolean OR
    (j->>'canSign')::boolean OR (j->>'canGuarantee')::boolean OR
    (j->>'authorizesWrite')::boolean OR
    (j->>'xLiveUnpaidAlreadyIncludedWei')::numeric<>5*e OR
    (j->>'physicalBaseAndXOutstandingWei')::numeric<>10*e OR
    (j->>'globalLiabilityIncludingHoldsWei')::numeric<>10*e OR
    (j->>'existingCohortLifetimeCommittedWei')::numeric<>20*e OR
    (j->>'cohortEffectiveBudgetWei')::numeric<>100*e OR
    NOT (j->>'accountingConsistent')::boolean THEN
    RAISE EXCEPTION 'Staged read bridge failed basic canonical/X reconciliation: %',j;
  END IF;
  -- Future hold is counted exactly once, alongside the original X/base 10.
  INSERT INTO reward_admission_bridge.holds(
    network,invite_code,app_id,reward_cohort_round_id,
    funding_allocation_receipt_id,amount_wei,status
  ) VALUES('mainnet','FAKE-INVITE-ONLY',app,123,1001,2*e,'HELD');
  SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO j;
  IF (j->>'globalLiabilityIncludingHoldsWei')::numeric<>12*e OR
    (j->>'cohortLifetimePlusHoldsWei')::numeric<>22*e OR
    (j->>'unconvertedGlobalHoldsWei')::numeric<>2*e THEN
    RAISE EXCEPTION 'Future hold was counted twice or forgotten: %',j;
  END IF;
  UPDATE reward_admission_bridge.holds SET status='CONVERTED' WHERE invite_code='FAKE-INVITE-ONLY';
  SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO j;
  IF (j->>'globalLiabilityIncludingHoldsWei')::numeric<>10*e THEN
    RAISE EXCEPTION 'Converted hold leaked a stale double obligation';
  END IF;
  UPDATE reward_admission_bridge.holds SET status='HELD',amount_wei=90*e
    WHERE invite_code='FAKE-INVITE-ONLY';
  SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO j;
  IF (j->>'accountingConsistent')::boolean OR (j->>'canAdmit')::boolean THEN
    RAISE EXCEPTION 'Cohort oversubscription should remain disarmed';
  END IF;
END $qa$;
DO $security$
DECLARE
  app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  j jsonb;
BEGIN
  BEGIN
    UPDATE reward_admission_bridge.settings SET enabled=true WHERE id=1;
    RAISE EXCEPTION 'FEATURE_SWITCH_BYPASS';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT enabled FROM reward_admission_bridge.settings WHERE id=1) THEN
    RAISE EXCEPTION 'Disabled policy turned on';
  END IF;
  BEGIN
    SELECT public.read_reward_admission_bridge_status_v1('mainnet','bad-app',123,1001) INTO j;
    RAISE EXCEPTION 'BAD_APP_ACCEPTED';
  EXCEPTION WHEN others THEN
    IF SQLERRM='BAD_APP_ACCEPTED' THEN RAISE; END IF;
  END;
  BEGIN
    SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,124,1001) INTO j;
    RAISE EXCEPTION 'BAD_COHORT_ACCEPTED';
  EXCEPTION WHEN others THEN
    IF SQLERRM='BAD_COHORT_ACCEPTED' THEN RAISE; END IF;
  END;
  IF has_function_privilege('anon','public.read_reward_admission_bridge_status_v1(text,text,bigint,bigint)','EXECUTE')
   OR has_function_privilege('authenticated','public.read_reward_admission_bridge_status_v1(text,text,bigint,bigint)','EXECUTE')
   OR has_schema_privilege('anon','reward_admission_bridge','USAGE')
   OR has_schema_privilege('authenticated','reward_admission_bridge','USAGE')
   OR has_table_privilege('service_role','reward_admission_bridge.holds','INSERT')
   OR has_table_privilege('service_role','reward_admission_bridge.holds','UPDATE') THEN
    RAISE EXCEPTION 'Unsafe table/function permissions';
  END IF;
  IF NOT has_function_privilege('service_role','public.read_reward_admission_bridge_status_v1(text,text,bigint,bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'Server cannot read diagnostic';
  END IF;
END $security$;
SELECT 'PASS: read-only staged bridge includes LIVE X once; cannot enable or write' AS result;