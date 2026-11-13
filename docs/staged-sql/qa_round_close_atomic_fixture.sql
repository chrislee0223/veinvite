-- QA ONLY: rollback-only scenario for an atomic equal-pay vote-round batch.
-- There is no on-chain transfer. Financial and queue writer calls are replaced
-- INSIDE this transaction with a mocked award ledger; never run on Production.
-- The staged migration source is injected at the placeholder below. This is a
-- regression of equal quoting, old outstanding liabilities, and full rollback,
-- NOT certification of the real Claim/X payout side effects.
BEGIN;
CREATE TEMP TABLE round_test_awards(
 invite_code text PRIMARY KEY, amount numeric(78,0) NOT NULL);
CREATE TEMP TABLE round_test_controls(
 fail_second boolean NOT NULL, preexisting_liability numeric(78,0) NOT NULL);
INSERT INTO pg_temp.round_test_controls VALUES(false,0);
CREATE TABLE reward_admission_bridge.elastic_settlement_settings(
 id int PRIMARY KEY,enabled boolean,rollout_not_before timestamptz,
 close_grace_hours int,x_option_reserve_wei numeric,min_real_reward_wei numeric);
INSERT INTO reward_admission_bridge.elastic_settlement_settings
 VALUES(1,false,now(),24,10000000000000000000,1);
CREATE TABLE reward_admission_bridge.shared_pool_settings(
 id int PRIMARY KEY,enabled boolean);
INSERT INTO reward_admission_bridge.shared_pool_settings VALUES (1,true);
-- QA Preview lacks the Production vote scanner checkpoint table.
-- This small parity table exists ONLY inside the transaction and rolls back.
CREATE TABLE public.vote_reconcile_scan_checkpoints (
 network text PRIMARY KEY,last_scanned_block bigint NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now());
-- The older QA database lacks the provisional-liability reader; its local
-- zero case is sufficient until the positive-collateral scenario overrides it.
CREATE OR REPLACE FUNCTION public.read_reward_elastic_contingent_liability_wei_v1(
 p_network text,p_app_id text)
RETURNS numeric LANGUAGE sql STABLE AS $qa$ SELECT 0::numeric $qa$;
/*__STAGED_SQL__*/
-- Activate BEFORE a receipt for the new round arrives. The activation guard
-- must reject any attempt to activate after the same round's receipt arrives.
UPDATE reward_admission_bridge.vote_round_close_settings
 SET first_vote_round_id=125,enabled=true WHERE id=1;
-- Fake test-wallet and vote events are uncommitted in an isolated QA transaction.
SET LOCAL session_replication_role='replica';
UPDATE public.reward_runtime_config
 SET mainnet_funded_rewards_enabled=true,sybil_v2_enforcement_enabled=false WHERE id=1;
INSERT INTO public.vebetter_round_allocations
(id,network,app_id,vebetter_round_id,x_allocation_pool_address,
 claim_tx_id,claim_block_number,claim_block_timestamp,recipient_wallet,
 caller_wallet,total_amount_wei,unallocated_amount_wei,
 team_allocation_amount_wei,rewards_allocation_amount_wei,observed_at)
VALUES (9999000,'mainnet',
'0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
125,'0x'||repeat('b',40),'0x'||repeat('a',64),950,
now()-interval '2 days','0x'||repeat('a',40),'0x'||repeat('a',40),
7000000000000000000000,0,0,7000000000000000000000,
now()-interval '2 days');
INSERT INTO public.vote_reconcile_scan_checkpoints(network,last_scanned_block,updated_at)
VALUES('mainnet',1000,now());
INSERT INTO public.invitations
(invite_code,inviter_wallet,invitee_wallet,status,apps_completed,
 rewards_received,vote_completed,reward_status,vot3_converted,
 vot3_converted_at,vot3_converted_block,vot3_conversion_tx_id,
 vot3_conversion_amount_wei,activated_at,activation_block,
 apps_completed_at,apps_completed_block,vote_completed_at,vote_completed_block,
 vote_round_id,reward_eligible_at,sybil_status,sybil_checked_at,
 activation_network,eligibility_check_id,impact_last_synced_block,
 impact_sync_complete_at,reward_cohort_round_id,
 reward_funding_allocation_receipt_id,reward_cohort_binding_source,
 identity_link_status,identity_link_checked_at,identity_link_policy_version,
 identity_link_evidence)
SELECT 'TEST22'||(i+1)::text,'0x'||repeat(chr(98+i),40),
 '0x'||repeat(chr(100+i),40),'COMPLETED',3,3,true,'ELIGIBLE',
 true,now()-interval '4 days',500,'0x'||repeat(chr(97+i),64),
 '1000000000000000000',now()-interval '7 days',100,now()-interval '5 days',300,
 now()-interval '3 days',900,125,now()-interval '2 days',
 'CLEAR',now()-interval '1 day','mainnet',9999000+i,1000,
 now()-interval '1 day',116,11,'ROUND_MATCH','NO_KNOWN_LINK',
 now()-interval '1 day','security_client_v2',
 '{"observedClientCount":"1"}'::jsonb
FROM generate_series(1,2) i;
INSERT INTO public.eligibility_check_events
(id,invite_code,wallet_address,network,checked_block,outcome,details,entry_class)
SELECT 9999000+i,'TEST22'||(i+1)::text,
 '0x'||repeat(chr(100+i),40),'mainnet',90,'ELIGIBLE','{}'::jsonb,'NEW'
FROM generate_series(1,2) i;
-- The real eligibility trigger requires the complete mission evidence: three
-- different dApp rewards, one VOT3 conversion, and the final allocation vote.
-- All values below are synthetic and uncommitted.
INSERT INTO public.invite_impact_events
(id,event_key,invite_code,network,wallet_address,event_type,tx_id,
 block_number,block_timestamp,app_id,amount_wei,tx_index,clause_index)
SELECT 9999100+i*10+j,'qa-dapp-'||i||'-'||j,
 'TEST22'||(i+1)::text,'mainnet','0x'||repeat(chr(100+i),40),
 'DAPP_REWARD','0x'||repeat(chr(96+j),64),
 CASE j WHEN 1 THEN 150 WHEN 2 THEN 250 ELSE 300 END,
 CASE j WHEN 3 THEN now()-interval '5 days'
  ELSE now()-interval '6 days' END,
 '0x'||repeat(chr(97+j),64),'100000000000000000',j,0
FROM generate_series(1,2) i CROSS JOIN generate_series(1,3) j;
INSERT INTO public.invite_impact_events
(id,event_key,invite_code,network,wallet_address,event_type,tx_id,
 block_number,block_timestamp,amount_wei,tx_index,clause_index)
SELECT 9999200+i,'qa-conversion-'||i,'TEST22'||(i+1)::text,
 'mainnet','0x'||repeat(chr(100+i),40),
 'VOT3_CONVERSION','0x'||repeat(chr(97+i),64),
 500,now()-interval '4 days','1000000000000000000',i,0
FROM generate_series(1,2) i;
INSERT INTO public.invite_impact_events
(id,event_key,invite_code,network,wallet_address,event_type,tx_id,
 block_number,block_timestamp,vote_round_id,tx_index,clause_index)
SELECT 9999000+i,'qa-round125-'||i,'TEST22'||(i+1)::text,'mainnet',
 '0x'||repeat(chr(100+i),40),'ALLOCATION_VOTE',
 '0x'||repeat((i+5)::text,64),900,now()-interval '3 days',125,i,0
FROM generate_series(1,2) i;
SET LOCAL session_replication_role='origin';
-- Two eligible users in ONE final vote round must require only ONE sweep
-- representative, independent of any 25-candidate legacy backlog.
DO $representatives_check$
BEGIN
 IF (SELECT count(*) FROM
   public.read_reward_vote_round_batch_representatives_v1('mainnet',125,25))<>1
   OR (SELECT min(invite_code) FROM
   public.read_reward_vote_round_batch_representatives_v1('mainnet',125,25))<>'TEST222'
 THEN RAISE EXCEPTION 'QA_FUTURE_ROUND_REPRESENTATIVE_MISSING'; END IF;
END;
$representatives_check$;

-- Replace only within transaction; rollback restores the actual QA functions.
CREATE OR REPLACE FUNCTION public.read_outstanding_reward_liability(
 p_network text,p_app_id text)
RETURNS text LANGUAGE sql STABLE AS $mock$
 SELECT (coalesce(sum(amount+10000000000000000000),0)
 + (SELECT preexisting_liability FROM pg_temp.round_test_controls))::text
 FROM pg_temp.round_test_awards
$mock$;
CREATE OR REPLACE FUNCTION public.commit_reward_reservation(
 p_invite_code text,p_network text,p_observed_pool_balance_wei numeric,
 p_expected_reserved_before_wei numeric,p_amount_wei numeric,
 p_algorithm_version text,p_quote_snapshot_id bigint,
 p_finalized_block bigint,p_basis jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $mock$
DECLARE existing numeric;
BEGIN
 SELECT coalesce(sum(amount+10000000000000000000),0)
 + (SELECT preexisting_liability FROM pg_temp.round_test_controls)
 INTO existing FROM pg_temp.round_test_awards;
 IF existing<>p_expected_reserved_before_wei
    OR p_algorithm_version<>'shared-pool-v1'
    OR p_basis->>'voteRoundId'<>'125'
 THEN RAISE EXCEPTION 'QA_BAD_BATCH_INPUT'; END IF;
 IF (SELECT fail_second FROM pg_temp.round_test_controls)
 AND (SELECT count(*) FROM pg_temp.round_test_awards)=1 THEN
    RAISE EXCEPTION 'QA_INJECT_SECOND_FAILURE';
 END IF;
 INSERT INTO pg_temp.round_test_awards(invite_code,amount)
 VALUES (p_invite_code,p_amount_wei);
 RETURN jsonb_build_object('reserved',true,'amountWei',p_amount_wei::text);
END;
$mock$;
SELECT public.commit_reward_vote_round_close_batch_v1(
 'TEST222','mainnet',7000000000000000000000,now(),1000) AS batch_result;
SELECT count(*) AS recipients,count(DISTINCT amount) AS distinct_awards,
 min(amount/1e18)::text AS per_winner_b3tr,
 sum(amount+10000000000000000000)/1e18 AS total_reserved_including_x
FROM pg_temp.round_test_awards;

-- Scenario 1: both winners are equal and 20 B3TR of X option reserved.
DO $qa$
BEGIN
 IF (SELECT count(*) FROM pg_temp.round_test_awards)<>2
 OR (SELECT count(DISTINCT amount) FROM pg_temp.round_test_awards)<>1
 OR (SELECT min(amount) FROM pg_temp.round_test_awards)<>3490000000000000000000
 OR (SELECT sum(amount+10000000000000000000) FROM pg_temp.round_test_awards)
 <>7000000000000000000000 THEN
   RAISE EXCEPTION 'QA_TWO_WINNER_EQUALITY_FAILED';
 END IF;
END;
$qa$;

-- Scenario 2: an existing unpaid 500 B3TR is protected before equal splitting.
TRUNCATE pg_temp.round_test_awards;
UPDATE pg_temp.round_test_controls SET preexisting_liability=500000000000000000000;
SELECT public.commit_reward_vote_round_close_batch_v1(
 'TEST222','mainnet',7000000000000000000000,now(),1000) AS existing_claim_protection_result;
DO $qa$
BEGIN
 IF (SELECT count(*) FROM pg_temp.round_test_awards)<>2
 OR (SELECT count(DISTINCT amount) FROM pg_temp.round_test_awards)<>1
 OR (SELECT min(amount) FROM pg_temp.round_test_awards)<>3240000000000000000000
 OR (SELECT sum(amount+10000000000000000000) FROM pg_temp.round_test_awards)
 +500000000000000000000<>7000000000000000000000 THEN
   RAISE EXCEPTION 'QA_EXISTING_CLAIM_NOT_PROTECTED';
 END IF;
END;
$qa$;

-- Scenario 3: second writer fails, and first writer's insert rolls back atomically.
TRUNCATE pg_temp.round_test_awards;
UPDATE pg_temp.round_test_controls SET preexisting_liability=0,fail_second=true;
DO $qa$
DECLARE saw_failure boolean:=false;
BEGIN
 BEGIN
   PERFORM public.commit_reward_vote_round_close_batch_v1(
    'TEST222','mainnet',7000000000000000000000,now(),1000);
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM LIKE '%QA_INJECT_SECOND_FAILURE%' THEN saw_failure:=true;
   ELSE RAISE; END IF;
 END;
 IF NOT saw_failure OR (SELECT count(*) FROM pg_temp.round_test_awards)<>0
 THEN RAISE EXCEPTION 'QA_ATOMIC_ROLLBACK_FAILED'; END IF;
END;
$qa$;

-- Scenario 4: unknown Sybil clearances prevent any reservation.
UPDATE pg_temp.round_test_controls SET fail_second=false;
UPDATE public.reward_runtime_config SET sybil_v2_enforcement_enabled=true WHERE id=1;
DO $qa$
DECLARE outcome jsonb;
BEGIN
 SELECT public.commit_reward_vote_round_close_batch_v1(
 'TEST222','mainnet',7000000000000000000000,now(),1000) INTO outcome;
 IF outcome->>'mode'<>'DEFER' OR
    outcome->>'reason'<>'AWAIT_VERIFIED_COMPLETIONS' OR
    (SELECT count(*) FROM pg_temp.round_test_awards)<>0 THEN
   RAISE EXCEPTION 'QA_SYBIL_FAIL_CLOSED_FAILED: %',outcome;
 END IF;
END;
$qa$;

-- Scenario 5: a receipt observed today cannot settle the round yet.
UPDATE public.reward_runtime_config SET sybil_v2_enforcement_enabled=false WHERE id=1;
SET LOCAL session_replication_role='replica';
UPDATE public.vebetter_round_allocations SET observed_at=now() WHERE id=9999000;
SET LOCAL session_replication_role='origin';
DO $qa$
DECLARE outcome jsonb;
BEGIN
 SELECT public.commit_reward_vote_round_close_batch_v1(
 'TEST222','mainnet',7000000000000000000000,now(),1000) INTO outcome;
 IF outcome->>'mode'<>'DEFER' OR
    outcome->>'reason'<>'WAIT_FOR_OFFICIAL_ROUND_CLOSE' OR
    (SELECT count(*) FROM pg_temp.round_test_awards)<>0 THEN
   RAISE EXCEPTION 'QA_PREMATURE_ROUND_SETTLEMENT: %',outcome;
 END IF;
END;
$qa$;
SELECT (SELECT count(*) FROM pg_temp.round_test_awards) AS final_awards_after_safety_cases,
  (SELECT preexisting_liability FROM pg_temp.round_test_controls) AS last_fixture_liability;
ROLLBACK;
