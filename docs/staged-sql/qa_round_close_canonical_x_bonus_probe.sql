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
 SET mainnet_funded_rewards_enabled=true,sybil_v2_enforcement_enabled=false,
 reward_x_promotion_enabled=true,reward_x_promotion_payout_enabled=true,
 reward_x_promotion_external_verification_ready=true,
 reward_x_promotion_live_started_at=now()-interval '30 days',
 reward_x_promotion_external_verification_started_at=now()-interval '30 days'
 WHERE id=1;
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
INSERT INTO public.referral_links(inviter_wallet,referral_key,status)
SELECT '0x'||repeat(chr(98+i),40),'QAFixtureKey000'||i,'ACTIVE'
FROM generate_series(1,2) i;
INSERT INTO public.reward_x_promotion_external_runtime_checks
(id,network,status,probe_post_id,checked_at)
VALUES(9999000,'mainnet','READY','123456789012345678',now());
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
-- The older QA X validator still applies a per-cohort cap to shared
-- reservations. Its current Production replacement is injected only into
-- the same rollback-only transaction.
/*__PROD_X_SPLIT_VALIDATOR__*/
-- X is tested only with fake referral links and an uncommitted healthy
-- external-runtime readiness receipt; no X API or on-chain transfer occurs.
CREATE TRIGGER reward_queue_create_x_promotion_live_split
AFTER INSERT ON public.reward_queue_entries
FOR EACH ROW EXECUTE FUNCTION public.create_reward_x_promotion_live_split_from_queue();

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

SELECT count(*) AS x_splits,COALESCE(sum(promotion_amount_wei)/1e18,0) AS x_total_b3tr,
 COALESCE(sum(base_amount_wei)/1e18,0) AS x_base_b3tr
FROM public.reward_x_promotion_splits WHERE invite_code IN ('TEST222','TEST223');
SELECT invite_code,exemption_reason FROM public.reward_x_promotion_split_exemptions
WHERE invite_code IN ('TEST222','TEST223') ORDER BY invite_code;
-- The real LIVE X split and obligation triggers must reserve exactly
-- 10 B3TR per recipient, without reducing either 3,490 B3TR base claim.
DO $qa_x$
BEGIN
 IF (SELECT count(*) FROM public.reward_x_promotion_splits
      WHERE invite_code IN ('TEST222','TEST223'))<>2
  OR (SELECT count(*) FROM public.reward_x_promotion_obligations
      WHERE invite_code IN ('TEST222','TEST223')
      AND financial_state='RESERVED')<>2
  OR (SELECT sum(promotion_amount_wei) FROM public.reward_x_promotion_splits
      WHERE invite_code IN ('TEST222','TEST223'))<>20000000000000000000
  OR (SELECT sum(base_amount_wei) FROM public.reward_x_promotion_splits
      WHERE invite_code IN ('TEST222','TEST223'))<>6980000000000000000000
  OR (SELECT count(*) FROM public.reward_x_promotion_split_exemptions
      WHERE invite_code IN ('TEST222','TEST223'))<>0
  OR (SELECT count(*) FROM public.reward_queue_entries
      WHERE invite_code IN ('TEST222','TEST223')
      AND status='AWAITING_CLAIM'
      AND reserved_amount_wei=3490000000000000000000)<>2
 THEN
   RAISE EXCEPTION 'QA_LIVE_X_ADDON_NOT_PHYSICALLY_RESERVED';
 END IF;
END;
$qa_x$;
ROLLBACK;
