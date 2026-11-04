-- Fake authority only, for PostgreSQL 17 integration QA; do not use in Production.
\set ON_ERROR_STOP on
DO $roles$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $roles$;
CREATE TABLE public.vebetter_round_allocations(
 id bigint PRIMARY KEY, network text NOT NULL, app_id text NOT NULL,
 vebetter_round_id bigint NOT NULL
);
INSERT INTO public.vebetter_round_allocations(id,network,app_id,vebetter_round_id)
VALUES(1001,'mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',122),
      (1002,'mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',123),
      (1003,'mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',124);
CREATE TABLE public.reward_admission_staging_qa_fixture (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  unpaid_live_x_wei numeric(78,0) NOT NULL CHECK(unpaid_live_x_wei>=0)
);
INSERT INTO public.reward_admission_staging_qa_fixture(id,unpaid_live_x_wei)
VALUES(true,5*power(10::numeric,18));

CREATE FUNCTION public.read_reward_x_promotion_post_base_liability_wei(p_network text,p_app_id text)
RETURNS numeric LANGUAGE sql STABLE AS $f$
 SELECT unpaid_live_x_wei FROM public.reward_admission_staging_qa_fixture WHERE id=true;
$f$;
CREATE FUNCTION public.read_outstanding_reward_liability(p_network text,p_app_id text)
RETURNS text LANGUAGE sql STABLE AS $f$
 SELECT (p.unpaid_fixed_wei + p.external_holds_wei +
         (SELECT unpaid_live_x_wei FROM public.reward_admission_staging_qa_fixture WHERE id=true))::text
 FROM reward_admission_lab.pool p WHERE p.id=true;
$f$;
CREATE FUNCTION public.read_reward_cohort_committed_wei(
  p_network text,p_app_id text,p_reward_cohort_round_id bigint,p_allocation_receipt_id bigint
) RETURNS numeric LANGUAGE sql STABLE AS $f$
 SELECT committed_wei FROM reward_admission_lab.cohorts
 WHERE id=p_reward_cohort_round_id AND receipt_id=p_allocation_receipt_id;
$f$;
CREATE FUNCTION public.read_reward_cohort_effective_budget_wei(
  p_network text,p_app_id text,p_reward_cohort_round_id bigint,p_allocation_receipt_id bigint
) RETURNS numeric LANGUAGE sql STABLE AS $f$
 SELECT budget_wei FROM reward_admission_lab.cohorts
 WHERE id=p_reward_cohort_round_id AND receipt_id=p_allocation_receipt_id;
$f$;