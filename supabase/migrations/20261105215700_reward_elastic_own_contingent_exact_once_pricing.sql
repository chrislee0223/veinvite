-- A paying cohort's provisional budget is already included in the global
-- physical liability. The payout forecast can subtract its OWN escrow once
-- (while other cohorts remain locked) before pricing; the unchanged
-- canonical reserve writer still checks the full global outstanding total.
-- This avoids double-counting the paying cohort but never permits an
-- unrelated payout to consume any other cohort's protected allocation.
BEGIN;
DO $patch$
DECLARE
 s text;
 before_decl text := ' v_outstanding numeric(78,0);';
 after_decl text := E' v_outstanding numeric(78,0);\n v_own_contingent numeric(78,0);';
 before_reader text := E' v_outstanding:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;';
 after_reader text := $new$
 v_outstanding:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
 v_own_contingent:=public.read_reward_elastic_contingent_scope_liability_wei_v1(
   p_network,v_app,v_inv.reward_cohort_round_id,
   v_inv.reward_funding_allocation_receipt_id);
 IF v_own_contingent>v_outstanding THEN
   RAISE EXCEPTION 'ELASTIC_SELF_CONTINGENT_EXCEEDS_GLOBAL';
 END IF;$new$;
 before_price text := $price$
 v_physical_headroom:=greatest(
   p_observed_pool_balance_wei-v_outstanding-v_total_stress-v_x_reserve,0);$price$;
 after_price text := $n$
 -- The global physical reader already protects the entire current cohort.
 -- Release that same cohort's contingent amount ONCE for pricing; the
 -- original canonical signer still sees the full global outstanding.
 v_physical_headroom:=greatest(
   p_observed_pool_balance_wei-v_outstanding+v_own_contingent
   -v_total_stress-v_x_reserve,0);$n$;
 before_basis text := $basis$
     'remainingProtectedSlots',v_unfixed+v_unresolved,
     'xOptionProtectedWei',v_x_reserve::text,$basis$;
 after_basis text := $basis2$
     'remainingProtectedSlots',v_unfixed+v_unresolved,
     'ownContingentAlreadyReservedWei',v_own_contingent::text,
     'xOptionProtectedWei',v_x_reserve::text,$basis2$;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO s FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='commit_reward_elastic_closed_cohort_v1';
 IF s IS NULL OR strpos(s,before_decl)=0
    OR strpos(s,before_reader)=0 OR strpos(s,before_price)=0
    OR strpos(s,before_basis)=0 OR strpos(s,'v_own_contingent')>0
 THEN RAISE EXCEPTION 'ELASTIC_COHORT_SELF_ESCROW_SOURCE_DRIFT'; END IF;
 EXECUTE replace(replace(replace(replace(s,
   before_decl,after_decl),
   before_reader,after_reader),
   before_price,after_price),
   before_basis,after_basis);
END $patch$;
COMMIT;
