\set ON_ERROR_STOP on
-- No Production database or onchain RPC is used in this test fixture.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA reward_admission_bridge;
CREATE TABLE public.invitations (
 id uuid PRIMARY KEY,
 invite_code text UNIQUE NOT NULL,
 activation_network text,
 reward_cohort_round_id bigint,
 status text NOT NULL,
 reward_status text NOT NULL,
 sybil_status text NOT NULL,
 ineligible_at timestamptz,
 invitee_wallet text,
 eligibility_check_id bigint,
 activated_at timestamptz,
 vote_completed boolean NOT NULL DEFAULT false
);
CREATE TABLE public.vebetter_round_allocations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 network text NOT NULL,
 app_id text NOT NULL,
 vebetter_round_id bigint NOT NULL,
 claim_block_number bigint
);
CREATE TABLE public.reward_queue_entries (
 invite_code text PRIMARY KEY,
 reserved_amount_wei numeric,
 status text
);
CREATE TABLE public.reward_payouts (
 invite_code text,
 status text
);
CREATE TABLE reward_admission_bridge.holds (
 invite_code text,network text,status text
);
INSERT INTO public.vebetter_round_allocations(network,app_id,vebetter_round_id,claim_block_number)
VALUES('mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',124,26428184);
INSERT INTO public.invitations VALUES
 ('00000000-0000-0000-0000-000000000001','C5RV7QG','mainnet',120,'ACTIVATING','PENDING','NOT_CHECKED',null,'0x1111111111111111111111111111111111111111',1,'2026-10-14 12:55:00+00',false),
 ('00000000-0000-0000-0000-000000000002','EDFW4Y7','mainnet',124,'ACTIVATING','PENDING','NOT_CHECKED',null,'0x2222222222222222222222222222222222222222',2,'2026-11-15 13:31:00+00',false),
 ('00000000-0000-0000-0000-000000000003','ACXKGKC','mainnet',124,'COMPLETED','ELIGIBLE','CLEAR',null,'0x3333333333333333333333333333333333333333',3,'2026-11-11 05:41:00+00',true),
 ('00000000-0000-0000-0000-000000000004','ZJ6WNCE','mainnet',120,'CANCELLED','FORFEITED','BLOCKED',null,'0x4444444444444444444444444444444444444444',4,'2026-10-14 13:00:00+00',false),
 ('00000000-0000-0000-0000-000000000005','WVYTYY6','mainnet',null,'ACTIVATING','PENDING','NOT_CHECKED',null,'0x5555555555555555555555555555555555555555',5,'2026-08-06 07:29:00+00',false),
 ('00000000-0000-0000-0000-000000000006','JR7D76M','mainnet',117,'UNDER_REVIEW','PENDING','REVIEW',null,'0x6666666666666666666666666666666666666666',6,'2026-09-27 09:47:00+00',false);
