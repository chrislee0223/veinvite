-- QA ONLY: rollback-only scenario for an atomic equal-pay vote-round batch.
-- There is no on-chain transfer. This QA transaction uses the unchanged
-- Production reservation writer and source payout/X validator functions with
-- synthetic proof rows; every change is rolled back. NEVER run on Production.
-- This validates atomic reservation and optional X split bookkeeping, not an
-- external signed B3TR broadcast or Twitter verification.
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
-- The older QA database lacks the provisional-liability reader; shared
-- physical-pool mode legitimately returns zero provisional collateral.
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
-- These come from current Production definitions at test-time, and are
-- transaction-local only. No real payout or external transaction is sent.
/*__PROD_COHORT_GUARD__*/
/*__PROD_CANONICAL_WRITER__*/
SELECT public.commit_reward_vote_round_close_batch_v1(
 'TEST222','mainnet',7000000000000000000000,now(),1000) AS batch_result;
SELECT count(*) AS queue_rows,count(DISTINCT reserved_amount_wei) AS distinct_awards,
 min(reserved_amount_wei/1e18)::text AS min_base_amount
FROM public.reward_queue_entries WHERE invite_code IN ('TEST222','TEST223');

-- Both claim reservations are immutable, so replay must not generate extras.
DO $qa$
DECLARE outcome jsonb;
BEGIN
 SELECT public.commit_reward_vote_round_close_batch_v1(
 'TEST222','mainnet',7000000000000000000000,now(),1000) INTO outcome;
 IF outcome->>'mode'<>'ALREADY_RESERVED' THEN
   RAISE EXCEPTION 'QA_ALREADY_RESERVED_REPLAY_NOT_IDEMPOTENT:%',outcome;
 END IF;
 IF (SELECT count(*) FROM public.reward_queue_entries
     WHERE invite_code IN ('TEST222','TEST223'))<>2
 OR (SELECT count(DISTINCT status) FROM public.reward_queue_entries
     WHERE invite_code IN ('TEST222','TEST223'))<>1
 OR (SELECT min(status) FROM public.reward_queue_entries
     WHERE invite_code IN ('TEST222','TEST223'))<>'AWAITING_CLAIM' THEN
   RAISE EXCEPTION 'QA_CANONICAL_RESERVATION_NOT_IDEMPOTENT';
 END IF;
END;
$qa$;
ROLLBACK;
