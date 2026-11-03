-- REHEARSAL ONLY. Fake original VeInvite RPCs for an isolated PostgreSQL 17.
\set ON_ERROR_STOP on
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
CREATE TABLE public.vebetter_round_allocations(
 id bigint PRIMARY KEY,
 network text NOT NULL,
 app_id text NOT NULL,
 vebetter_round_id bigint NOT NULL
);
INSERT INTO public.vebetter_round_allocations(id,network,app_id,vebetter_round_id)
VALUES(1001,'mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',122);
CREATE TABLE public.reward_admission_staging_qa_authority (
 id boolean PRIMARY KEY CHECK(id),
 base_unpaid_wei numeric(78,0) NOT NULL,
 x_held_wei numeric(78,0) NOT NULL,
 cohort_lifetime_wei numeric(78,0) NOT NULL,
 cohort_budget_wei numeric(78,0) NOT NULL
);
INSERT INTO public.reward_admission_staging_qa_authority
VALUES(true,5*power(10::numeric,18),5*power(10::numeric,18),20*power(10::numeric,18),100*power(10::numeric,18));
CREATE FUNCTION public.read_outstanding_reward_liability(text,text) RETURNS text
LANGUAGE sql STABLE AS $f$
 SELECT (base_unpaid_wei+x_held_wei)::text
 FROM public.reward_admission_staging_qa_authority WHERE id=true;
$f$;
CREATE FUNCTION public.read_reward_x_promotion_post_base_liability_wei(text,text) RETURNS numeric
LANGUAGE sql STABLE AS $f$
 SELECT x_held_wei FROM public.reward_admission_staging_qa_authority WHERE id=true;
$f$;
CREATE FUNCTION public.read_reward_cohort_committed_wei(text,text,bigint,bigint) RETURNS numeric
LANGUAGE sql STABLE AS $f$
 SELECT cohort_lifetime_wei FROM public.reward_admission_staging_qa_authority WHERE id=true;
$f$;
CREATE FUNCTION public.read_reward_cohort_effective_budget_wei(text,text,bigint,bigint) RETURNS numeric
LANGUAGE sql STABLE AS $f$
 SELECT cohort_budget_wei FROM public.reward_admission_staging_qa_authority WHERE id=true;
$f$;