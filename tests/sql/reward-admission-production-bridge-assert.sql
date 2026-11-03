-- Run only after fake readers + staged migration in isolated PostgreSQL 17.
\set ON_ERROR_STOP on
DO $qa$
DECLARE j jsonb; e numeric(78,0):=power(10::numeric,18);
  app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
BEGIN
  SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO j;
  IF j->>'model'<>'staged-disabled-v1'
    OR (j->>'canAdmit')::boolean OR (j->>'canGuarantee')::boolean
    OR (j->>'canSign')::boolean OR (j->>'enabled')::boolean
    OR (j->>'physicalBaseAndXOutstandingWei')::numeric<>10*e
    OR (j->>'xLiveUnpaidAlreadyIncludedWei')::numeric<>5*e
    OR (j->>'globalLiabilityIncludingHoldsWei')::numeric<>10*e
  THEN RAISE EXCEPTION 'Unfunded or accidentally active staged bridge: %',j; END IF;

  -- Existing physical liability is base UNPAID 5 + X HELD 5, not X twice.
  INSERT INTO reward_admission_bridge.holds(
    network,invite_code,app_id,reward_cohort_round_id,
    funding_allocation_receipt_id,amount_wei,status
  ) VALUES('mainnet','STAGING-FAKE-A',app,123,1001,2*e,'HELD');
  SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO j;
  IF (j->>'globalLiabilityIncludingHoldsWei')::numeric<>12*e
     OR (j->>'unconvertedCohortHoldsWei')::numeric<>2*e
     OR (j->>'cohortLifetimePlusHoldsWei')::numeric<>2*e
     OR NOT (j->>'accountingConsistent')::boolean
     OR (j->>'canAdmit')::boolean THEN
    RAISE EXCEPTION 'Existing X was double counted or staged feature enabled: %',j;
  END IF;
  UPDATE reward_admission_bridge.holds SET status='CONVERTED' WHERE invite_code='STAGING-FAKE-A';
  SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO j;
  IF (j->>'globalLiabilityIncludingHoldsWei')::numeric<>10*e OR
     (j->>'unconvertedCohortHoldsWei')::numeric<>0
  THEN RAISE EXCEPTION 'Converted hold remained in admission liability: %',j; END IF;
  
  -- A hold can be represented as an auditable deficit, but never authorized.
  INSERT INTO reward_admission_bridge.holds(
    network,invite_code,app_id,reward_cohort_round_id,
    funding_allocation_receipt_id,amount_wei,status
  ) VALUES('mainnet','STAGING-FAKE-OVER',app,123,1001,6*e,'HELD');
  SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1001) INTO j;
  IF (j->>'accountingConsistent')::boolean OR (j->>'canAdmit')::boolean THEN
    RAISE EXCEPTION 'Underfunded cohort cannot become admissible: %',j;
  END IF;
END $qa$;

DO $qa$
DECLARE app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  j jsonb;
BEGIN
  -- Every user-controlled mismatched scope must be rejected.
  BEGIN
    SELECT public.read_reward_admission_bridge_status_v1('mainnet','BAD',123,1001) INTO j;
    RAISE EXCEPTION 'INVALID_APP_WAS_ACCEPTED';
  EXCEPTION WHEN others THEN
    IF SQLERRM='INVALID_APP_WAS_ACCEPTED' THEN RAISE; END IF;
  END;
  BEGIN
    SELECT public.read_reward_admission_bridge_status_v1('mainnet',app,123,1002) INTO j;
    RAISE EXCEPTION 'INVALID_COHORT_RECEIPT_WAS_ACCEPTED';
  EXCEPTION WHEN others THEN
    IF SQLERRM='INVALID_COHORT_RECEIPT_WAS_ACCEPTED' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE reward_admission_bridge.settings SET enabled=true WHERE id=1;
    RAISE EXCEPTION 'STAGING_FEATURE_WAS_ENABLED';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT enabled FROM reward_admission_bridge.settings WHERE id=1) THEN
    RAISE EXCEPTION 'Staging feature flipped true';
  END IF;
  IF has_function_privilege('anon','public.read_reward_admission_bridge_status_v1(text,text,bigint,bigint)','EXECUTE')
    OR has_function_privilege('authenticated','public.read_reward_admission_bridge_status_v1(text,text,bigint,bigint)','EXECUTE')
    OR has_schema_privilege('anon','reward_admission_bridge','USAGE')
    OR has_table_privilege('service_role','reward_admission_bridge.holds','INSERT')
    OR has_table_privilege('authenticated','reward_admission_bridge.holds','SELECT')
  THEN RAISE EXCEPTION 'Staged funding ledger exposes writable or public access'; END IF;
  IF NOT has_function_privilege('service_role','public.read_reward_admission_bridge_status_v1(text,text,bigint,bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'Service-only diagnostic access missing';
  END IF;
END $qa$;
SELECT 'PASS: staged real-schema financial bridge, immutable disable gate, X included once, no user access' result;