-- Fully isolated PostgreSQL 17 fixture: NEVER uses Production credentials.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA reward_admission_bridge;
CREATE TABLE reward_admission_bridge.vote_round_close_settings (
 id smallint PRIMARY KEY, enabled boolean,paused boolean,first_vote_round_id bigint);
INSERT INTO reward_admission_bridge.vote_round_close_settings VALUES(1,true,false,125);
CREATE TABLE reward_admission_bridge.shared_pool_settings (id smallint PRIMARY KEY,enabled boolean);
INSERT INTO reward_admission_bridge.shared_pool_settings VALUES(1,true);
CREATE TABLE reward_admission_bridge.elastic_settlement_settings (
 id smallint PRIMARY KEY,x_option_reserve_wei numeric,min_real_reward_wei numeric);
INSERT INTO reward_admission_bridge.elastic_settlement_settings VALUES
 (1,10000000000000000000,1000000000000000000);
CREATE TABLE reward_admission_bridge.holds (network text,invite_code text,status text);
CREATE TABLE public.reward_runtime_config (
 id smallint PRIMARY KEY, emergency_rewards_paused boolean,mainnet_funded_rewards_enabled boolean);
INSERT INTO public.reward_runtime_config VALUES(1,false,true);
CREATE TABLE public.invitations (
 invite_code text PRIMARY KEY, activation_network text, vote_round_id bigint,
 reward_cohort_round_id bigint,reward_funding_allocation_receipt_id bigint,
 invitee_wallet text,eligibility_check_id bigint,status text,reward_status text,
 sybil_status text,ineligible_at timestamptz);
INSERT INTO public.invitations VALUES
 ('ACXKGKC','mainnet',125,124,11,'0x1111111111111111111111111111111111111111',1,'COMPLETED','ELIGIBLE','CLEAR',null),
 ('R4LKDJM','mainnet',125,124,11,'0x2222222222222222222222222222222222222222',2,'COMPLETED','ELIGIBLE','CLEAR',null),
 ('EDFW4Y7','mainnet',null,124,11,'0x3333333333333333333333333333333333333333',3,'ACTIVATING','PENDING','NOT_CHECKED',null),
 ('C5RV7QG','mainnet',null,120,8,'0x4444444444444444444444444444444444444444',4,'ACTIVATING','PENDING','NOT_CHECKED',null),
 ('ZJ6WNCE','mainnet',null,124,11,'0x5555555555555555555555555555555555555555',5,'CANCELLED','FORFEITED','BLOCKED',null);
CREATE TABLE public.reward_queue_entries(
 invite_code text PRIMARY KEY,network text NOT NULL,
 reserved_amount_wei numeric(78,0),reservation_algorithm_version text,
 reservation_basis jsonb,status text DEFAULT 'AWAITING_CLAIM');
CREATE OR REPLACE FUNCTION public.read_reward_vote_round_candidates_v1(p_network text,p_vote_round_id bigint)
 RETURNS TABLE(invite_code text,completion_block bigint)
 LANGUAGE sql STABLE
AS $f$
 SELECT i.invite_code,26428269::bigint
 FROM public.invitations i
 WHERE i.activation_network=p_network AND i.vote_round_id=p_vote_round_id
   AND i.status='COMPLETED' AND i.reward_status='ELIGIBLE'
   AND i.sybil_status='CLEAR';
$f$;
CREATE OR REPLACE FUNCTION public.read_outstanding_reward_liability(p_network text,p_app_id text)
RETURNS numeric LANGUAGE sql STABLE
AS $f$ SELECT coalesce(sum(q.reserved_amount_wei),0)
 FROM public.reward_queue_entries q WHERE q.network=p_network AND q.status<>'CANCELLED'; $f$;
CREATE OR REPLACE FUNCTION public.read_reward_cohort_committed_wei(
 p_network text,p_app_id text,p_cohort_round bigint,p_allocation_id bigint)
RETURNS numeric LANGUAGE sql STABLE
AS $f$ SELECT 0::numeric; $f$;
CREATE OR REPLACE FUNCTION public.commit_reward_reservation(
 p_invite_code text,p_network text,p_observed_pool_balance_wei numeric,
 p_expected_reserved_before_wei numeric,p_amount_wei numeric,
 p_algorithm_version text,p_quote_snapshot_id bigint,p_finalized_block bigint,p_basis jsonb)
RETURNS jsonb LANGUAGE plpgsql
AS $f$
DECLARE actual numeric;
BEGIN
 actual:=public.read_outstanding_reward_liability(p_network,'fake-app');
 IF actual<>p_expected_reserved_before_wei THEN
  RETURN jsonb_build_object('reserved',false,'reason','RECALCULATE');
 END IF;
 IF p_observed_pool_balance_wei-actual<p_amount_wei THEN
  RETURN jsonb_build_object('reserved',false,'reason','POOL_INSUFFICIENT');
 END IF;
 INSERT INTO public.reward_queue_entries(
   invite_code,network,reserved_amount_wei,reservation_algorithm_version,reservation_basis)
 VALUES(p_invite_code,p_network,p_amount_wei,p_algorithm_version,p_basis);
 RETURN jsonb_build_object('reserved',true,'amountWei',p_amount_wei::text);
END;
$f$;
