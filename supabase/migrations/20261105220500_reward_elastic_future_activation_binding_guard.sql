-- The global contingent collateral reader intentionally fails closed on
-- new, accepted invitations with no round receipt. Prevent that poisoned
-- state at its source: in the existing AFTER-binding BEFORE-INSERT trigger.
-- The rule only applies when protected partial settlement is enabled.
BEGIN;
DO $patch$
DECLARE
 fn text;
 old_check text := $old$
  if new.reward_cohort_binding_source is not null then
      raise exception 'REWARD_COHORT_BINDING_SOURCE_WITHOUT_BINDING';
    end if;
    return new;$old$;
 new_check text := $new$
  -- Funding identity is mandatory for every NEW, active, post-rollout
  -- referral once partial settlement is enabled. Do not insert an
  -- unbound invite that would stop every other payer's physical guard.
  IF new.activation_network='mainnet'
     AND new.activated_at IS NOT NULL
     AND new.status IN ('ACTIVATING','UNDER_REVIEW','COMPLETED')
     AND EXISTS (
       SELECT 1 FROM reward_admission_bridge.elastic_settlement_settings e
       WHERE e.id=1 AND e.enabled AND e.allow_protected_partial_settlement
         AND new.activated_at>=e.rollout_not_before
     ) THEN
     RAISE EXCEPTION 'ELASTIC_ROLLOUT_REQUIRES_CANONICAL_FUNDING_RECEIPT';
  END IF;
  if new.reward_cohort_binding_source is not null then
      raise exception 'REWARD_COHORT_BINDING_SOURCE_WITHOUT_BINDING';
    end if;
    return new;$new$;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO fn FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='set_reward_cohort_binding_source';
 IF fn IS NULL OR strpos(fn,old_check)=0 OR
   strpos(fn,'ELASTIC_ROLLOUT_REQUIRES_CANONICAL_FUNDING_RECEIPT')>0
 THEN RAISE EXCEPTION 'ELASTIC_FUTURE_BINDING_SOURCE_DRIFT'; END IF;
 EXECUTE replace(fn,old_check,new_check);
END $patch$;
COMMIT;