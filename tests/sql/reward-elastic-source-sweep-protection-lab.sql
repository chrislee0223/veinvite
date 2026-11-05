-- Disposable PG17 scaffolding for the *source sweep* migration itself.
-- Function body anchors match Production, but these are fake versions.
\set ON_ERROR_STOP on
ALTER TABLE public.reward_boost_reserve_source_protections
 ADD COLUMN IF NOT EXISTS source_allocation_receipt_id bigint;
CREATE OR REPLACE FUNCTION public.read_reward_boost_reserve_source_candidate(
 p_network text,p_app_id text,
 p_source_reward_cohort_round_id bigint,p_source_allocation_receipt_id bigint
) RETURNS jsonb LANGUAGE plpgsql STABLE AS $fn$
declare
 v_effective_budget numeric(78,0);
begin
  v_effective_budget :=
    public.read_reward_cohort_effective_budget_wei(
      p_network,p_app_id,p_source_reward_cohort_round_id,
      p_source_allocation_receipt_id);
  return jsonb_build_object('budget',v_effective_budget::text);
end $fn$;
CREATE OR REPLACE FUNCTION public.read_reward_boost_reserve_unprotected_sources(
 p_network text,p_app_id text
) RETURNS TABLE(reward_cohort_round_id bigint,allocation_receipt_id bigint)
LANGUAGE plpgsql STABLE AS $fn$
begin
  return query
  select a.vebetter_round_id+1,a.id
  from public.vebetter_round_allocations a
  where a.network=p_network and a.app_id=p_app_id
    and not exists (
      select 1
      from public.reward_boost_reserve_source_protections p
      where p.network=a.network and p.app_id=a.app_id
        and p.source_reward_cohort_round_id=a.vebetter_round_id+1
        and p.source_allocation_receipt_id=a.id
    );
end $fn$;
