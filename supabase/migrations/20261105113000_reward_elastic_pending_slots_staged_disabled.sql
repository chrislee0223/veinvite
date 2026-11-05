-- Future-only, opt-in partial settlement when a closed cohort still contains
-- unfinished referrals. NO invitation is cancelled or forfeited. Off by default.
-- Not a new early promise: each verified claimant uses the existing fixed writer.
-- Before enabling, every external reward sweep must be proven to preserve
-- contingent (not-yet-eligible) member budget; otherwise leave disabled.
BEGIN;
ALTER TABLE reward_admission_bridge.elastic_settlement_settings
 ADD COLUMN IF NOT EXISTS allow_protected_partial_settlement boolean NOT NULL DEFAULT false;

DO $patch$
DECLARE
 v_def text;
 v_old_gate text := $old$
 IF v_unresolved<>0 OR v_valid=0 OR v_unfixed=0 THEN
   RETURN jsonb_build_object('mode','DEFER','reason','UNRESOLVED_OR_EMPTY_RECIPIENT_SET',
     'unresolved',v_unresolved);
 END IF;$old$;
 v_new_gate text := $new$
 IF v_valid=0 OR v_unfixed=0 THEN
   RETURN jsonb_build_object('mode','DEFER','reason','NO_UNFIXED_VERIFIED_WINNER');
 END IF;
 -- Default OFF until every external fund mover respects contingent slots.
 IF v_unresolved>0 AND NOT v_cfg.allow_protected_partial_settlement THEN
   RETURN jsonb_build_object('mode','DEFER','reason','UNRESOLVED_OR_EMPTY_RECIPIENT_SET',
     'unresolved',v_unresolved);
 END IF;$new$;
 v_old_x text := ' v_x_reserve:=v_valid*v_cfg.x_option_reserve_wei;';
 v_new_x text := ' v_x_reserve:=(v_valid+v_unresolved)*v_cfg.x_option_reserve_wei;';
 v_old_div text := ' v_quote:=floor(least(v_budget_headroom,v_physical_headroom)/v_unfixed);';
 v_new_div text := ' v_quote:=floor(least(v_budget_headroom,v_physical_headroom)/(v_unfixed+v_unresolved));';
 v_old_basis text := $old$
     'unfixedRecipients',v_unfixed,
     'xOptionProtectedWei',v_x_reserve::text,$old$;
 v_new_basis text := $new$
     'unfixedRecipients',v_unfixed,
     'contingentUnresolvedRecipients',v_unresolved,
     'remainingProtectedSlots',v_unfixed+v_unresolved,
     'xOptionProtectedWei',v_x_reserve::text,$new$;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='commit_reward_elastic_closed_cohort_v1';
 IF v_def IS NULL
    OR strpos(v_def,v_old_gate)=0 OR strpos(v_def,v_new_gate)>0
    OR strpos(v_def,v_old_x)=0 OR strpos(v_def,v_old_div)=0
    OR strpos(v_def,v_old_basis)=0
 THEN RAISE EXCEPTION 'ELASTIC_PARTIAL_SETTLEMENT_SOURCE_DRIFT'; END IF;
 EXECUTE replace(replace(replace(replace(v_def,
      v_old_gate,v_new_gate),v_old_x,v_new_x),
      v_old_div,v_new_div),v_old_basis,v_new_basis);
END $patch$;

-- Privileges of the existing service-only RPC remain intact.
DO $guard$
BEGIN
 IF has_function_privilege('anon',
    'public.commit_reward_elastic_closed_cohort_v1(text,text,numeric,timestamptz,bigint,numeric,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated',
    'public.commit_reward_elastic_closed_cohort_v1(text,text,numeric,timestamptz,bigint,numeric,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'ELASTIC_FINANCIAL_WRITER_PRIVILEGE_LEAK'; END IF;
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.elastic_settlement_settings
            WHERE id=1 AND allow_protected_partial_settlement)
 THEN RAISE EXCEPTION 'ELASTIC_PARTIAL_MUST_START_DISABLED'; END IF;
END $guard$;
COMMIT;
