-- Partial settlement post-Claim collateral liveness.
-- A finished future cohort MUST NOT tie up leftover physical funds forever.
-- Continue protecting the full unused allocation while ANY genuine recipient
-- remains unfixed, a base Claim is in-flight, a 72h X publication opportunity
-- remains open, or an X post/obligation is actively being verified or funded.
-- This delegates to the already deployed SOURCE_SWEEP guard, ensuring both
-- physical availability and source recycling use one terminality predicate.
-- No payouts, claims, invitation statuses or wallet balances are changed.
BEGIN;
DO $patch$
DECLARE
  v_function text;
  old_block text := $before$
   v_unspent:=v_budget-v_active_committed-v_finalized_paid_not_in_queue;
   v_total:=v_total+v_unspent;$before$;
  new_block text := $after$
   -- Release ONLY once the source-sweep interlock independently confirms
   -- no pending invite, unpaid base Claim, 72h X opportunity or LIVE X
   -- verification remains. A confirmed BLOCKED Sybil is terminal.
   IF public.reward_elastic_source_has_unsettled_slots_v1(
     p_network,v_app,v_cohort.round_id,v_cohort.receipt_id
   ) THEN
     v_unspent:=v_budget-v_active_committed-v_finalized_paid_not_in_queue;
   ELSE
     v_unspent:=0;
   END IF;
   v_total:=v_total+v_unspent;$after$;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_function
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname=
   'read_reward_elastic_contingent_scope_liability_wei_v1';
 IF v_function IS NULL OR strpos(v_function,old_block)=0
   OR strpos(v_function,'no pending invite, unpaid base Claim')>0
 THEN RAISE EXCEPTION 'ELASTIC_TERMINAL_COLLATERAL_SOURCE_DRIFT'; END IF;
 EXECUTE replace(v_function,old_block,new_block);
END $patch$;
COMMIT;