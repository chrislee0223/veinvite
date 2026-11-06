-- Production exact-once canonical writer fix:
-- Whole-cohort pre-funded collateral is an encumbrance, NOT a different
-- wallet's money. When a verified elastic writer reserves a base reward,
-- convert the paying cohort's own *existing* contingent allocation into the
-- canonical queue at one price and under the original global reservation lock.
-- Do not let another (legacy or X) payer borrow that allocation.
-- Do not bypass funding insolvency (actual pool must cover global liabilities).
-- Only a trusted service-only elastic writer with validated official close,
-- fresh finality and an exact allocated amount can use this exception.
BEGIN;
DO $patch$
DECLARE
 original text;
 old_decl text:='  v_reserved numeric(78,0) := 0;';
 new_decl text:=$d$
  v_reserved numeric(78,0) := 0;
  v_elastic_self_escrow numeric(78,0) := 0;
  v_spendable_wei numeric(78,0) := 0;$d$;
 old_guard text:=$old$
  if v_net>greatest(p_observed_pool_balance_wei-v_reserved,0) then
    return jsonb_build_object(
      'reserved',false,
      'reason','RECALCULATE',
      'reservedExistingWei',v_reserved::text,
      'availableWei',greatest(p_observed_pool_balance_wei-v_reserved,0)::text
    );
  end if;$old$;
 new_guard text:=$new$
  -- A future cohort's still-unspent allocation is included in the global
  -- reserved amount. The existing canonical signer must release that SAME
  -- cohort's own escrow for the exact reservation being converted.
  -- All other payouts and older cohorts still use the original guard.
  IF p_algorithm_version='elastic-closed-cohort-v1' THEN
    IF coalesce(p_basis->'elasticClosure'->>'policy','')<>'elastic-closed-cohort-v1'
       OR v_invitation.reward_cohort_round_id IS NULL
       OR v_invitation.reward_funding_allocation_receipt_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM reward_admission_bridge.elastic_settlement_settings e
         WHERE e.id=1 AND e.enabled AND e.allow_protected_partial_settlement
           AND v_invitation.activated_at>=e.rollout_not_before
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.vebetter_round_allocations a
         JOIN reward_admission_bridge.elastic_settlement_settings e ON e.id=1
         WHERE a.network=v_network
           AND a.app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
           AND a.vebetter_round_id=v_invitation.reward_cohort_round_id
           AND a.observed_at+make_interval(hours=>e.close_grace_hours)
               <=clock_timestamp()
       )
    THEN RAISE EXCEPTION 'ELASTIC_CANONICAL_SELF_ESCROW_AUTHORITY_MISSING';
    END IF;
    v_elastic_self_escrow :=
      public.read_reward_elastic_contingent_scope_liability_wei_v1(
        v_network,
        '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
        v_invitation.reward_cohort_round_id,
        v_invitation.reward_funding_allocation_receipt_id
      );
    IF v_elastic_self_escrow<p_amount_wei THEN
      RETURN jsonb_build_object(
        'reserved',false,'reason','RECALCULATE',
        'remainingOwnEscrowWei',v_elastic_self_escrow::text);
    END IF;
  END IF;
  -- GLOBAL insolvency is never bypassed, even for a future elastic cohort.
  v_spendable_wei:=greatest(
    p_observed_pool_balance_wei-v_reserved+v_elastic_self_escrow,0);
  if p_observed_pool_balance_wei<v_reserved OR v_net>v_spendable_wei then
    return jsonb_build_object(
      'reserved',false,
      'reason','RECALCULATE',
      'reservedExistingWei',v_reserved::text,
      'availableWei',v_spendable_wei::text
    );
  end if;$new$;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO original
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='commit_reward_reservation';
 IF original IS NULL OR strpos(original,old_decl)=0 OR
    strpos(original,old_guard)=0 OR
    strpos(original,'v_elastic_self_escrow')>0
 THEN RAISE EXCEPTION 'ELASTIC_CANONICAL_PHYSICAL_GUARD_SOURCE_DRIFT'; END IF;
 EXECUTE replace(replace(original,old_decl,new_decl),old_guard,new_guard);
END $patch$;
COMMIT;