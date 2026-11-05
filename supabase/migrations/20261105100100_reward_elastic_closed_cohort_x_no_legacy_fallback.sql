-- Forward-only correction after verified staged migration. Do not edit
-- the immutable original migration already recorded in Production.
BEGIN;
DO $patch$
DECLARE
 v_def text;
 old_needle text := $old$
 -- Preserve live payout behavior if boost is not provably larger than the
 -- existing reward quote. Never block an ordinary funded eligible Claim.
 IF v_quote<=p_legacy_amount_wei OR v_quote<v_cfg.min_real_reward_wei THEN
   RETURN jsonb_build_object('mode','LEGACY','reason','NO_VERIFIED_BOOST_CAPACITY');
 END IF;$old$;
 new_needle text := $new$
 -- A verified, closed cohort must not fall back to legacy forecast spending
 -- after X-option collateral has been budgeted. Even with many participants
 -- it must reserve all remaining recipients' gross and future X options.
 IF v_quote<v_cfg.min_real_reward_wei THEN
   RETURN jsonb_build_object('mode','BLOCKED',
     'reason','COHORT_X_AND_OLDER_PROTECTION_UNDERFUNDED');
 END IF;$new$;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='commit_reward_elastic_closed_cohort_v1';
 IF v_def IS NULL OR strpos(v_def,old_needle)=0
    OR strpos(v_def,new_needle)>0 THEN
    RAISE EXCEPTION 'ELASTIC_CANONICAL_CORRECTION_SOURCE_DRIFT';
 END IF;
 EXECUTE replace(v_def,old_needle,new_needle);
END $patch$;
COMMIT;
