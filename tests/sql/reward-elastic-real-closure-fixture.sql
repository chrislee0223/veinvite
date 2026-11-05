-- Synthetic production-schema-compatible elastic closure fixture only.
\set ON_ERROR_STOP on
ALTER TABLE public.vebetter_round_allocations
 ADD COLUMN IF NOT EXISTS observed_at timestamptz NOT NULL DEFAULT now()-interval '2 days';
UPDATE public.vebetter_round_allocations SET observed_at=now()-interval '2 days';
UPDATE public.vebetter_round_allocations
 SET rewards_allocation_amount_wei=1000*power(10::numeric,18)
 WHERE id=1003;
INSERT INTO public.vebetter_round_allocations(id,network,app_id,vebetter_round_id,rewards_allocation_amount_wei,observed_at)
VALUES (1004,'mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
 125,1000*power(10::numeric,18),now()-interval '2 days');
CREATE TABLE public.reward_runtime_config (
 id smallint PRIMARY KEY,
 mainnet_funded_rewards_enabled boolean NOT NULL,
 emergency_rewards_paused boolean NOT NULL
);
INSERT INTO public.reward_runtime_config VALUES(1,true,false);
ALTER TABLE public.invitations
 ADD COLUMN IF NOT EXISTS reward_status text DEFAULT 'ELIGIBLE',
 ADD COLUMN IF NOT EXISTS reward_eligible_at timestamptz,
 ADD COLUMN IF NOT EXISTS vote_completed boolean DEFAULT true,
 ADD COLUMN IF NOT EXISTS reward_paid_at timestamptz,
 ADD COLUMN IF NOT EXISTS activated_at timestamptz;
CREATE TABLE public.reward_boost_reserve_source_protections (
 network text, app_id text,source_reward_cohort_round_id bigint,
 late_reward_wei numeric(78,0),long_incomplete_count integer
);
CREATE OR REPLACE FUNCTION public.read_reward_boost_reserve_recent_protected_wei(
 text,text,bigint) RETURNS numeric LANGUAGE sql STABLE AS $f$ SELECT 20::numeric*power(10::numeric,18) $f$;
CREATE OR REPLACE FUNCTION public.read_reward_boost_reserve_bank_stress_reserve_wei(
 text,text) RETURNS numeric LANGUAGE sql STABLE AS $f$ SELECT 10::numeric*power(10::numeric,18) $f$;
-- No Production users or wallet records. This synthetic cohort is already
-- officially closed for >24h, so tests exercise actual financial gates.
INSERT INTO public.invitations(invite_code,reward_cohort_round_id,
 reward_funding_allocation_receipt_id,activation_network,status,
 sybil_status,reward_status,reward_eligible_at,vote_completed,activated_at)
VALUES
 ('ELASTIC-USER1',125,1003,'mainnet','COMPLETED','CLEAR','ELIGIBLE',now()-interval '6 hours',true,now()-interval '6 days'),
 ('ELASTIC-USER2',125,1003,'mainnet','COMPLETED','CLEAR','ELIGIBLE',now()-interval '5 hours',true,now()-interval '6 days'),
 ('ELASTIC-UNFIN',125,1003,'mainnet','ACTIVATING','NOT_CHECKED','PENDING',null,false,now()-interval '6 days'),
 ('ELASTIC-OLDUSER',125,1003,'mainnet','COMPLETED','CLEAR','ELIGIBLE',now()-interval '6 hours',true,now()-interval '30 days');
