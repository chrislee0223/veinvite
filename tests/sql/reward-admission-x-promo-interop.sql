-- X promotion + minimum admission interoperation on isolated fake-ledger rows.
-- NOT a Supabase migration. No mainnet token movements or user records.
\set ON_ERROR_STOP on
CREATE TABLE reward_admission_lab.x_promotion_fake (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cohort_id bigint NOT NULL REFERENCES reward_admission_lab.cohorts(id),
  amount_wei numeric(78,0) NOT NULL CHECK (amount_wei>0),
  split_mode text NOT NULL CHECK (split_mode IN ('SHADOW','LIVE')),
  financial_state text NOT NULL CHECK (financial_state IN ('RESERVED','HELD','PAID','RELEASED'))
);
CREATE FUNCTION reward_admission_lab.read_x_physical()
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO pg_catalog,reward_admission_lab AS $f$
  SELECT coalesce(sum(amount_wei),0)
  FROM reward_admission_lab.x_promotion_fake
  WHERE split_mode='LIVE' AND financial_state IN ('RESERVED','HELD');
$f$;
CREATE FUNCTION reward_admission_lab.read_x_lifetime(p_cohort bigint)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO pg_catalog,reward_admission_lab AS $f$
  SELECT coalesce(sum(amount_wei),0)
  FROM reward_admission_lab.x_promotion_fake
  WHERE split_mode='LIVE' AND cohort_id=p_cohort
    AND financial_state IN ('RESERVED','HELD','PAID');
$f$;
REVOKE ALL ON TABLE reward_admission_lab.x_promotion_fake FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION reward_admission_lab.read_x_physical() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION reward_admission_lab.read_x_lifetime(bigint) FROM PUBLIC,anon,authenticated;

BEGIN;
DO $qa$
DECLARE
  x_id bigint;
  x_other bigint;
  available numeric(78,0);
  fixed_code text;
  r text;
  snapshot jsonb;
  e numeric(78,0) := power(10::numeric,18);
BEGIN
  SELECT code INTO fixed_code FROM reward_admission_lab.fixed_rewards
   WHERE state='UNPAID' ORDER BY code LIMIT 1;
  IF fixed_code IS NULL THEN RAISE EXCEPTION 'Missing ordinary unpaid fixed payout'; END IF;

  -- New X 10 B3TR HELD comes out of *additional* funded liquidity.
  INSERT INTO reward_admission_lab.x_promotion_fake(cohort_id,amount_wei,split_mode,financial_state)
   VALUES (125,10*e,'LIVE','HELD') RETURNING id INTO x_id;
  INSERT INTO reward_admission_lab.x_promotion_fake(cohort_id,amount_wei,split_mode,financial_state)
   VALUES (125,100*e,'SHADOW','HELD') RETURNING id INTO x_other;
  IF reward_admission_lab.read_x_physical()<>10*e OR
     reward_admission_lab.read_x_lifetime(125)<>10*e THEN
    RAISE EXCEPTION 'X LIVE amount incorrectly includes SHADOW or excludes HELD';
  END IF;

  UPDATE reward_admission_lab.pool
     SET physical_wei=physical_wei+10*e, external_holds_wei=external_holds_wei+10*e
   WHERE id=true;
  SELECT reward_admission_lab.read_full_liability_snapshot() INTO snapshot;
  IF (snapshot->>'poolUnderfunded')::boolean OR
     (snapshot->>'unallocatedPhysicalWei')::numeric<>0 THEN
    RAISE EXCEPTION 'X unpaid should be protected exactly once: %',snapshot;
  END IF;
  SELECT reward_admission_lab.check_fixed_manifest_signable(fixed_code,5*e) INTO r;
  IF r<>'SIGNABLE_SHADOW' THEN
    RAISE EXCEPTION 'X held caused a valid base payout to be refused: %',r;
  END IF;

  -- A second unrelated LIVE X obligation, with NO fresh tokens, must BLOCK.
  INSERT INTO reward_admission_lab.x_promotion_fake(cohort_id,amount_wei,split_mode,financial_state)
   VALUES (125,10*e,'LIVE','RESERVED');
  UPDATE reward_admission_lab.pool SET external_holds_wei=external_holds_wei+10*e WHERE id=true;
  SELECT reward_admission_lab.check_fixed_manifest_signable(fixed_code,5*e) INTO r;
  IF r<>'LIABILITY_UNDERFUNDED' THEN
    RAISE EXCEPTION 'Unfunded second X claim would double-spend: %',r;
  END IF;
  DELETE FROM reward_admission_lab.x_promotion_fake
   WHERE cohort_id=125 AND financial_state='RESERVED';
  UPDATE reward_admission_lab.pool SET external_holds_wei=external_holds_wei-10*e WHERE id=true;

  -- After *canonical* X PAID, physical balance and HELD debt both decrease,
  -- but lifetime cohort accounting still includes the paid 10 B3TR.
  UPDATE reward_admission_lab.x_promotion_fake SET financial_state='PAID' WHERE id=x_id;
  UPDATE reward_admission_lab.pool
     SET physical_wei=physical_wei-10*e,external_holds_wei=external_holds_wei-10*e
   WHERE id=true;
  IF reward_admission_lab.read_x_physical()<>0 OR
     reward_admission_lab.read_x_lifetime(125)<>10*e THEN
    RAISE EXCEPTION 'PAID X must leave physical debt but remain lifetime-committed';
  END IF;
  SELECT reward_admission_lab.check_fixed_manifest_signable(fixed_code,5*e) INTO r;
  IF r<>'SIGNABLE_SHADOW' THEN
    RAISE EXCEPTION 'PAID X incorrectly consumed remaining base payout: %',r;
  END IF;

  -- RELEASED, by contrast, is not an existing financial obligation.
  UPDATE reward_admission_lab.x_promotion_fake SET financial_state='RELEASED' WHERE id=x_id;
  IF reward_admission_lab.read_x_physical()<>0 OR
     reward_admission_lab.read_x_lifetime(125)<>0 THEN
    RAISE EXCEPTION 'RELEASED X must not continue to consume either budget';
  END IF;
END $qa$;
ROLLBACK;

DO $qa$
BEGIN
  IF has_function_privilege('anon','reward_admission_lab.read_x_physical()','EXECUTE') OR
     has_function_privilege('authenticated','reward_admission_lab.read_x_lifetime(bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'Public financial X ledger reader access';
  END IF;
END $qa$;
SELECT 'PASS: LIVE X RESERVED/HELD/PAID/RELEASED, base reward signing, and isolated physical & lifetime accounting' AS result;