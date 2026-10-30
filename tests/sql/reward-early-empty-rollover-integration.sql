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
END
$qa$;

-- A forged/mismatched sweep ledger must NOT unlock the early 1,930 ceiling.
BEGIN;
SAVEPOINT bad_ledger;
INSERT INTO public.reward_boost_reserve_source_protections
(network,app_id,source_reward_cohort_round_id,source_allocation_receipt_id,
 baseline_effective_budget_wei,baseline_committed_wei,
 promotion_original_wei,promotion_reserve_wei,late_reward_wei,
 queued_eligible_count,long_incomplete_count,late_weighted_bps,
 late_weighted_liability_wei,max_sweepable_wei,source_revision,policy_version)
VALUES
('mainnet','0x' || repeat('a',64),122,9,
 1930*power(10::numeric,18),0,0,0,0,0,0,0,0,
 1930*power(10::numeric,18),'qa-revision','reward-boost-reserve-v1');
INSERT INTO public.reward_boost_reserve_ledger
(network,app_id,entry_kind,source_reward_cohort_round_id,source_allocation_receipt_id,
 amount_wei,policy_version,reference_key,details)
VALUES
('mainnet','0x' || repeat('a',64),'SOURCE_SWEEP',122,9,
 1000*power(10::numeric,18),'qa-mismatch','mismatch','{}');
DO $qa$
DECLARE r jsonb;
BEGIN
 SELECT public.seal_and_release_reward_boost_destination(
  'mainnet','0x' || repeat('a',64),10000*power(10::numeric,18),'reward-boost-reserve-v2-adaptive'
 ) INTO r;
 IF r->>'changed'<>'true' OR (r->>'maxBoostReleaseWei')::numeric<>957*power(10::numeric,18) THEN
   RAISE EXCEPTION 'mismatched sweep proof must fall back to original ceiling: %',r;
 END IF;
END
$qa$;
ROLLBACK TO SAVEPOINT bad_ledger;
COMMIT;

-- Create matching immutable SOURCE_SWEEP evidence (in a fixture only).
INSERT INTO public.reward_boost_reserve_source_protections
(network,app_id,source_reward_cohort_round_id,source_allocation_receipt_id,
 baseline_effective_budget_wei,baseline_committed_wei,
 promotion_original_wei,promotion_reserve_wei,late_reward_wei,
 queued_eligible_count,long_incomplete_count,late_weighted_bps,
 late_weighted_liability_wei,max_sweepable_wei,source_revision,policy_version)
VALUES
('mainnet','0x' || repeat('a',64),122,9,
 1930*power(10::numeric,18),0,0,0,0,0,0,0,0,
 1930*power(10::numeric,18),'qa-revision','reward-boost-reserve-v1');
INSERT INTO public.reward_boost_reserve_ledger
(network,app_id,entry_kind,source_reward_cohort_round_id,source_allocation_receipt_id,
 amount_wei,policy_version,reference_key,details)
VALUES
('mainnet','0x' || repeat('a',64),'SOURCE_SWEEP',122,9,
 1930*power(10::numeric,18),'qa-match','verified-source','{}');

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
