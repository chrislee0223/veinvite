-- Atomic guard both source discovery and actual SOURCE_SWEEP candidate.
-- Prevents recycling contingent future cohort money after a provisional
-- partial reservation. Existing old-cohort source logic remains unchanged.
BEGIN;
DO $guard$
DECLARE
 src text;
 list_sql text;
 anchor text := $a$
  v_effective_budget :=
    public.read_reward_cohort_effective_budget_wei($a$;
 injected text := $b$
  -- A prior partial payout is NOT proof every bound invitee is terminal.
  -- The caller holds the shared cohort/net advisory lock before source SWEEP.
  if public.reward_elastic_source_has_unsettled_slots_v1(
    p_network,p_app_id,
    p_source_reward_cohort_round_id,p_source_allocation_receipt_id
  ) then
    raise exception 'ELASTIC_COHORT_PENDING_MONEY_PROTECTED';
  end if;

$b$;
 list_anchor text := $c$
    and not exists (
      select 1
      from public.reward_boost_reserve_source_protections p
$c$;
 list_new text := $d$
    and not public.reward_elastic_source_has_unsettled_slots_v1(
      a.network,a.app_id,a.vebetter_round_id+1,a.id
    )
$d$;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='read_reward_boost_reserve_source_candidate';
 SELECT pg_get_functiondef(p.oid) INTO list_sql FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='read_reward_boost_reserve_unprotected_sources';
 IF src IS NULL OR list_sql IS NULL
   OR strpos(src,anchor)=0 OR strpos(list_sql,list_anchor)=0
   OR strpos(src,'reward_elastic_source_has_unsettled_slots_v1')>0
   OR strpos(list_sql,'reward_elastic_source_has_unsettled_slots_v1')>0
 THEN RAISE EXCEPTION 'ELASTIC_SOURCE_SWEEP_PROTECTION_BASELINE_DRIFT'; END IF;
 EXECUTE replace(src,anchor,injected||anchor);
 EXECUTE replace(list_sql,list_anchor,list_new||list_anchor);
END $guard$;
COMMIT;
