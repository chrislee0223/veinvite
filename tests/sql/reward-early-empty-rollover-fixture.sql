-- Isolated PostgreSQL 17 QA fixture. No Production/preview credentials or user data.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.reward_runtime_config (
  id integer PRIMARY KEY,
  reward_boost_reserve_enabled boolean NOT NULL,
  reward_boost_reserve_adaptive_v2_enabled boolean NOT NULL,
  reward_boost_reserve_long_incomplete_rounds integer NOT NULL,
  reward_boost_reserve_promotion_reserve_bps integer NOT NULL,
  emergency_rewards_paused boolean NOT NULL,
  mainnet_funded_rewards_enabled boolean NOT NULL
);
INSERT INTO public.reward_runtime_config VALUES (1,true,true,2,1500,false,true);

CREATE TABLE public.vebetter_round_allocations (
  id bigint PRIMARY KEY,
  network text NOT NULL,
  app_id text NOT NULL,
  vebetter_round_id bigint NOT NULL,
  rewards_allocation_amount_wei numeric(78,0) NOT NULL
);
CREATE TABLE public.invitations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  activation_network text,
  reward_cohort_round_id bigint,
  reward_funding_allocation_receipt_id bigint,
  status text,
  sybil_status text,
  invitee_wallet text,
  vote_completed boolean,
  apps_completed integer,
  vot3_converted boolean
);
CREATE TABLE public.sybil_v2_wallet_restrictions (
  network text, wallet_address text, status text
);
CREATE TABLE public.reward_cohort_funding_adjustments (
  network text, app_id text, reward_cohort_round_id bigint,
  allocation_receipt_id bigint, amount_wei numeric(78,0),
  adjustment_type text
);
CREATE TABLE public.reward_boost_reserve_source_protections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  network text, app_id text, source_reward_cohort_round_id bigint,
  source_allocation_receipt_id bigint,
  baseline_effective_budget_wei numeric(78,0),
  baseline_committed_wei numeric(78,0),
  promotion_original_wei numeric(78,0),
  promotion_reserve_wei numeric(78,0),
  late_reward_wei numeric(78,0),
  queued_eligible_count integer,
  long_incomplete_count integer,
  late_weighted_bps numeric(78,0),
  late_weighted_liability_wei numeric(78,0),
  max_sweepable_wei numeric(78,0),
  source_revision text, policy_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.reward_boost_reserve_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  network text, app_id text, entry_kind text,
  source_reward_cohort_round_id bigint,
  source_allocation_receipt_id bigint,
  destination_reward_cohort_round_id bigint,
  destination_allocation_receipt_id bigint,
  amount_wei numeric(78,0), policy_version text,
  reference_key text, details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.reward_boost_reserve_destination_plans (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  network text, app_id text,
  destination_reward_cohort_round_id bigint,
  destination_allocation_receipt_id bigint,
  baseline_fresh_designated_wei numeric(78,0),
  baseline_committed_wei numeric(78,0),
  baseline_fresh_pricing_capacity_wei numeric(78,0),
  bank_balance_before_wei numeric(78,0),
  bank_stress_reserve_wei numeric(78,0),
  recent_cohort_protected_wei numeric(78,0),
  source_retained_protection_wei numeric(78,0),
  observed_pool_balance_wei numeric(78,0),
  reserved_existing_wei numeric(78,0),
  physical_extra_headroom_wei numeric(78,0),
  max_boost_release_wei numeric(78,0),
  policy_version text
);

-- Fixture-only stand-ins for unchanged Production accounting functions.
-- These make new SQL execute against real PostgreSQL and exercise real guards,
-- but do NOT substitute for Supabase Production-schema integration.
CREATE TABLE public.qa_commitments (
  network text, app_id text, reward_cohort_round_id bigint,
  allocation_receipt_id bigint, amount_wei numeric(78,0)
);
CREATE TABLE public.qa_guards (
  id integer PRIMARY KEY,
  bank_stress_wei numeric(78,0),
  recent_protected_wei numeric(78,0),
  retained_wei numeric(78,0),
  globally_reserved_wei numeric(78,0),
  cleared_pending_count integer NOT NULL DEFAULT 0
);
INSERT INTO public.qa_guards VALUES (1,0,0,0,0,0);

CREATE FUNCTION public.read_reward_cohort_committed_wei(text,text,bigint,bigint)
RETURNS numeric LANGUAGE sql STABLE AS $f$
  SELECT coalesce(sum(amount_wei),0)
  FROM public.qa_commitments
  WHERE network=$1 AND app_id=$2 AND reward_cohort_round_id=$3 AND allocation_receipt_id=$4
$f$;
CREATE FUNCTION public.read_reward_cohort_effective_budget_wei(text,text,bigint,bigint)
RETURNS numeric LANGUAGE sql STABLE AS $f$
  SELECT coalesce((SELECT rewards_allocation_amount_wei
           FROM public.vebetter_round_allocations
           WHERE network=$1 AND app_id=$2 AND vebetter_round_id+1=$3 AND id=$4),0)
       + coalesce((SELECT sum(amount_wei) FROM public.reward_boost_reserve_ledger
                   WHERE network=$1 AND app_id=$2 AND
                   entry_kind='BOOST_RELEASE' AND
                   destination_reward_cohort_round_id=$3 AND
                   destination_allocation_receipt_id=$4),0)
$f$;
CREATE FUNCTION public.read_reward_boost_reserve_source_revision(text,text)
RETURNS text LANGUAGE sql STABLE AS $f$ SELECT 'qa-source-revision'::text $f$;
CREATE FUNCTION public.read_sybil_v2_cleared_unreserved_count(text,bigint,bigint)
RETURNS bigint LANGUAGE sql STABLE AS $f$
  SELECT cleared_pending_count::bigint FROM public.qa_guards WHERE id=1
$f$;
CREATE FUNCTION public.read_reward_boost_reserve_balance_wei(text,text)
RETURNS numeric LANGUAGE sql STABLE AS $f$
  SELECT coalesce(sum(CASE WHEN entry_kind='SOURCE_SWEEP' THEN amount_wei
                           WHEN entry_kind='BOOST_RELEASE' THEN -amount_wei ELSE 0 END),0)
  FROM public.reward_boost_reserve_ledger WHERE network=$1 AND app_id=$2
$f$;
CREATE FUNCTION public.read_reward_boost_reserve_bank_stress_reserve_wei(text,text)
RETURNS numeric LANGUAGE sql STABLE AS $f$
  SELECT bank_stress_wei FROM public.qa_guards WHERE id=1
$f$;
CREATE FUNCTION public.read_reward_boost_reserve_recent_protected_wei(text,text,bigint)
RETURNS numeric LANGUAGE sql STABLE AS $f$
  SELECT recent_protected_wei FROM public.qa_guards WHERE id=1
$f$;
CREATE FUNCTION public.read_reward_boost_reserve_source_retained_wei(text,text)
RETURNS numeric LANGUAGE sql STABLE AS $f$
  SELECT retained_wei FROM public.qa_guards WHERE id=1
$f$;
CREATE FUNCTION public.read_reward_cohort_planning_snapshot(text,text,bigint,bigint)
RETURNS jsonb LANGUAGE sql STABLE AS $f$
  SELECT jsonb_build_object(
    'reservedExistingWei', (select globally_reserved_wei::text from public.qa_guards where id=1),
    'pipeline', jsonb_build_object(
      'queuedEligibleCount',0,
      'voteReadyCount',0,
      'vot3ReadyCount',0,
      'appsTwoCount',0,
      'appsOneCount',0,
      'activatedZeroCount',0)
  )
$f$;

-- Prior funded cohort 122: 1,930 B3TR, no invite/commitment;
-- next cohort 123: 638 B3TR, new round 122 receipt.
INSERT INTO public.vebetter_round_allocations
(id,network,app_id,vebetter_round_id,rewards_allocation_amount_wei)
VALUES
(9,'mainnet','0x' || repeat('a',64),121,1930*power(10::numeric,18)),
(10,'mainnet','0x' || repeat('a',64),122,638*power(10::numeric,18));
