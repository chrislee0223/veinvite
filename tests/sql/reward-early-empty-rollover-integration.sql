-- Real PostgreSQL execution against isolated fixture (never Production).
\set ON_ERROR_STOP on
DO $qa$
DECLARE
  app text := '0x' || repeat('a',64);
  n bigint;
  quote jsonb;
  threw boolean;
BEGIN
  SELECT count(*) INTO n FROM public.read_reward_boost_reserve_unprotected_sources('mainnet',app)
  WHERE reward_cohort_round_id=122;
  IF n<>0 THEN RAISE EXCEPTION 'FLAG_OFF should not sweep immature cohort'; END IF;

  UPDATE public.reward_runtime_config
    SET reward_boost_early_empty_rollover_enabled=true WHERE id=1;
  SELECT count(*) INTO n FROM public.read_reward_boost_reserve_unprotected_sources('mainnet',app)
  WHERE reward_cohort_round_id=122;
  IF n<>1 THEN RAISE EXCEPTION 'empty previous cohort should become eligible'; END IF;
  SELECT public.read_reward_boost_reserve_source_candidate('mainnet',app,122,9) INTO quote;
  IF (quote->>'maxSweepableWei')::numeric<>1930*power(10::numeric,18) THEN
    RAISE EXCEPTION 'sweep candidate must equal verified empty budget: %',quote;
  END IF;

  INSERT INTO public.invitations
   (activation_network,reward_cohort_round_id,reward_funding_allocation_receipt_id,status)
  VALUES ('mainnet',122,9,'CANCELLED');
  SELECT count(*) INTO n FROM public.read_reward_boost_reserve_unprotected_sources('mainnet',app)
  WHERE reward_cohort_round_id=122;
  IF n<>0 THEN RAISE EXCEPTION 'cancelled invitation must block early sweep'; END IF;

  threw:=false;
  BEGIN
    PERFORM public.read_reward_boost_reserve_source_candidate('mainnet',app,122,9);
  EXCEPTION WHEN OTHERS THEN
    threw:=position('REWARD_BOOST_RESERVE_SOURCE_NOT_MATURE' in SQLERRM)>0;
  END;
  IF NOT threw THEN RAISE EXCEPTION 'source must independently reject prior invitation'; END IF;
  DELETE FROM public.invitations WHERE reward_cohort_round_id=122;

  INSERT INTO public.qa_commitments
   (network,app_id,reward_cohort_round_id,allocation_receipt_id,amount_wei)
  VALUES ('mainnet',app,122,9,1);
  SELECT count(*) INTO n FROM public.read_reward_boost_reserve_unprotected_sources('mainnet',app)
  WHERE reward_cohort_round_id=122;
  IF n<>0 THEN RAISE EXCEPTION '1 Wei commitment must block early sweep'; END IF;
  DELETE FROM public.qa_commitments WHERE reward_cohort_round_id=122;

  UPDATE public.qa_guards SET cleared_pending_count=1 WHERE id=1;
  SELECT count(*) INTO n FROM public.read_reward_boost_reserve_unprotected_sources('mainnet',app)
  WHERE reward_cohort_round_id=122;
  IF n<>0 THEN RAISE EXCEPTION 'cleared pending reward candidate must block early sweep'; END IF;
  threw:=false;
  BEGIN
    PERFORM public.read_reward_boost_reserve_source_candidate('mainnet',app,122,9);
  EXCEPTION WHEN OTHERS THEN
    threw:=position('REWARD_BOOST_RESERVE_SOURCE_NOT_MATURE' in SQLERRM)>0;
  END;
  IF NOT threw THEN RAISE EXCEPTION 'maturity guard must block pending cleared reward'; END IF;
  UPDATE public.qa_guards SET cleared_pending_count=0 WHERE id=1;
END
$qa$;

-- Run the real source-seal function from the existing Production migration.
-- Unlike a hand-crafted ledger, this verifies source candidate -> SQL lock ->
-- immutable protection -> SOURCE_SWEEP audit, including repeated-run idempotency.
DO $qa$
DECLARE
  app text := '0x' || repeat('a',64);
  result jsonb;
  repeat_result jsonb;
  sweep_count integer;
BEGIN
  SELECT public.seal_and_sweep_reward_boost_reserve_source(
    'mainnet',app,122,9,'reward-boost-reserve-v1'
  ) INTO result;
  IF result->>'changed'<>'true' OR
     (result->>'maxSweepableWei')::numeric<>1930*power(10::numeric,18) THEN
    RAISE EXCEPTION 'actual source sweep failed: %',result;
  END IF;
  SELECT public.seal_and_sweep_reward_boost_reserve_source(
    'mainnet',app,122,9,'reward-boost-reserve-v1'
  ) INTO repeat_result;
  IF repeat_result->>'changed'<>'false' THEN
    RAISE EXCEPTION 'source re-execution was not idempotent: %',repeat_result;
  END IF;
  SELECT count(*) INTO sweep_count
  FROM public.reward_boost_reserve_ledger
  WHERE entry_kind='SOURCE_SWEEP' AND source_reward_cohort_round_id=122;
  IF sweep_count<>1 THEN
    RAISE EXCEPTION 'expected exactly one real SOURCE_SWEEP';
  END IF;
END
$qa$;

-- A tampered/mismatched SOURCE_SWEEP amount must NOT unlock a larger release.
BEGIN;
SAVEPOINT bad_ledger;
UPDATE public.reward_boost_reserve_ledger SET amount_wei=1000*power(10::numeric,18)
WHERE entry_kind='SOURCE_SWEEP' AND source_reward_cohort_round_id=122;
DO $qa$
DECLARE r jsonb;
BEGIN
 SELECT public.seal_and_release_reward_boost_destination(
  'mainnet','0x' || repeat('a',64),10000*power(10::numeric,18),'reward-boost-reserve-v2-adaptive'
 ) INTO r;
 IF r->>'changed'<>'true' OR
    (r->>'maxBoostReleaseWei')::numeric<>957*power(10::numeric,18) THEN
   RAISE EXCEPTION 'mismatched sweep proof must fall back to original ceiling: %',r;
 END IF;
END
$qa$;
ROLLBACK TO SAVEPOINT bad_ledger;
COMMIT;

-- Disabling the feature must preserve old behavior even after a valid source sweep.
BEGIN;
SAVEPOINT flag_off;
UPDATE public.reward_runtime_config SET reward_boost_early_empty_rollover_enabled=false WHERE id=1;
DO $qa$
DECLARE r jsonb;
BEGIN
 SELECT public.seal_and_release_reward_boost_destination(
  'mainnet','0x' || repeat('a',64),10000*power(10::numeric,18),'reward-boost-reserve-v2-adaptive'
 ) INTO r;
 IF r->>'changed'<>'true' OR (r->>'maxBoostReleaseWei')::numeric<>957*power(10::numeric,18) THEN
    RAISE EXCEPTION 'flag-OFF parity failed: %',r;
 END IF;
END
$qa$;
ROLLBACK TO SAVEPOINT flag_off;
COMMIT;

-- A destination with any invitation must not receive the early extra ceiling.
BEGIN;
SAVEPOINT has_user;
INSERT INTO public.invitations (activation_network,reward_cohort_round_id,status)
VALUES ('mainnet',123,'ACTIVATING');
DO $qa$
DECLARE r jsonb;
BEGIN
 SELECT public.seal_and_release_reward_boost_destination(
  'mainnet','0x' || repeat('a',64),10000*power(10::numeric,18),'reward-boost-reserve-v2-adaptive'
 ) INTO r;
 IF r->>'changed'<>'true' OR (r->>'maxBoostReleaseWei')::numeric<>957*power(10::numeric,18) THEN
    RAISE EXCEPTION 'destination user must disable early top-up: %',r;
 END IF;
END
$qa$;
ROLLBACK TO SAVEPOINT has_user;
COMMIT;

-- Additional previously bound commitment blocks the novel ceiling.
BEGIN;
SAVEPOINT has_commitment;
INSERT INTO public.qa_commitments (network,app_id,reward_cohort_round_id,allocation_receipt_id,amount_wei)
VALUES ('mainnet','0x' || repeat('a',64),123,10,1);
DO $qa$
DECLARE r jsonb;
BEGIN
 SELECT public.seal_and_release_reward_boost_destination(
  'mainnet','0x' || repeat('a',64),10000*power(10::numeric,18),'reward-boost-reserve-v2-adaptive'
 ) INTO r;
 IF r->>'changed'<>'true' OR (r->>'maxBoostReleaseWei')::numeric >= 1930*power(10::numeric,18) THEN
   RAISE EXCEPTION 'destination commitment did not block early top-up: %',r;
 END IF;
END
$qa$;
ROLLBACK TO SAVEPOINT has_commitment;
COMMIT;

-- Bank stress reserve and physical headroom are hard caps even for audited source.
BEGIN;
SAVEPOINT bank_stress;
UPDATE public.qa_guards SET bank_stress_wei=500*power(10::numeric,18) WHERE id=1;
DO $qa$
DECLARE r jsonb;
BEGIN
 SELECT public.seal_and_release_reward_boost_destination(
  'mainnet','0x' || repeat('a',64),10000*power(10::numeric,18),'reward-boost-reserve-v2-adaptive'
 ) INTO r;
 IF (r->>'maxBoostReleaseWei')::numeric <>1430*power(10::numeric,18) THEN
   RAISE EXCEPTION 'bank stress protection missing: %',r;
 END IF;
END
$qa$;
ROLLBACK TO SAVEPOINT bank_stress;
COMMIT;

BEGIN;
SAVEPOINT physical;
UPDATE public.qa_guards SET recent_protected_wei=9500*power(10::numeric,18) WHERE id=1;
DO $qa$
DECLARE r jsonb;
BEGIN
 SELECT public.seal_and_release_reward_boost_destination(
  'mainnet','0x' || repeat('a',64),10000*power(10::numeric,18),'reward-boost-reserve-v2-adaptive'
 ) INTO r;
 IF r->>'changed'<>'false' OR r->>'reason'<>'NO_SAFE_BOOST_CAPACITY' THEN
   RAISE EXCEPTION 'physical liquidity must block release: %',r;
 END IF;
END
$qa$;
ROLLBACK TO SAVEPOINT physical;
COMMIT;

-- Happy path: 1,930 B3TR historical unused source + new 638 B3TR = 856 B3TR
-- at 3 funded completion slots; existing destination plans remain immutable.
DO $qa$
DECLARE r jsonb; repeat_result jsonb; payout numeric; boost_count integer;
BEGIN
 SELECT public.seal_and_release_reward_boost_destination(
  'mainnet','0x' || repeat('a',64),10000*power(10::numeric,18),'reward-boost-reserve-v2-adaptive'
 ) INTO r;
 IF r->>'changed'<>'true' OR (r->>'maxBoostReleaseWei')::numeric<>1930*power(10::numeric,18) THEN
    RAISE EXCEPTION 'verified empty rollover should release 1930 B3TR: %',r;
 END IF;
 SELECT public.read_reward_cohort_effective_budget_wei(
  'mainnet','0x' || repeat('a',64),123,10
 ) / power(10::numeric,18) / 3 INTO payout;
 IF payout<>856 THEN RAISE EXCEPTION 'expected exactly 856 conditional B3TR, got %',payout; END IF;
 SELECT public.seal_and_release_reward_boost_destination(
  'mainnet','0x' || repeat('a',64),10000*power(10::numeric,18),'reward-boost-reserve-v2-adaptive'
 ) INTO repeat_result;
 IF repeat_result->>'changed'<>'false' THEN
    RAISE EXCEPTION 'duplicate execution must be idempotent: %',repeat_result;
 END IF;
 SELECT count(*) INTO boost_count
 FROM public.reward_boost_reserve_ledger
 WHERE entry_kind='BOOST_RELEASE' AND destination_reward_cohort_round_id=123;
 IF boost_count<>1 THEN RAISE EXCEPTION 'duplicate ledgers after repeated run'; END IF;
 RAISE NOTICE 'PASS: real PG17 syntax, guards, liquidity caps, ledger proof, and idempotency';
END
$qa$;
