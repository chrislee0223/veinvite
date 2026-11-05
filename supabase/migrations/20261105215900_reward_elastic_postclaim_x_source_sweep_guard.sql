-- Protect post-Claim X publication/verification window from SOURCE_SWEEP.
-- The earlier sweep interlock guarded only referrals without a base queue.
-- This staged correction also covers already-PAID referrals for 72 hours
-- (the 24h post + 24h hold plus operational margin) and any active LIVE X
-- obligation, even long after base Claim.
BEGIN;
DO $patch$
DECLARE
 fn text;
 old_tail text := E'\n );\nEND';
 new_tail text := $new$
 ) OR EXISTS (
   SELECT 1
   FROM public.invitations i
   JOIN public.reward_payouts p ON p.invite_code=i.invite_code
   JOIN public.reward_rounds rr ON rr.id=p.round_id
   WHERE i.activation_network=p_network
     AND i.reward_cohort_round_id=p_reward_cohort_round_id
     AND i.reward_funding_allocation_receipt_id=p_receipt_id
     AND i.activated_at>=v_rollout
     AND i.status<>'CANCELLED'
     AND rr.network=p_network AND rr.app_id=v_app
     AND p.status='PAID'
     AND (p.paid_at IS NULL
          OR p.paid_at>clock_timestamp()-interval '72 hours')
 ) OR EXISTS (
   SELECT 1
   FROM public.reward_x_promotion_obligations x
   JOIN public.invitations i ON i.invite_code=x.invite_code
   WHERE x.network=p_network
     AND x.source_reward_cohort_round_id=p_reward_cohort_round_id
     AND x.source_allocation_receipt_id=p_receipt_id
     AND i.activation_network=p_network
     AND i.activated_at>=v_rollout
     AND x.financial_state IN ('RESERVED','HELD')
 ) OR EXISTS (
   SELECT 1
   FROM public.reward_x_promotion_post_submissions x
   JOIN public.invitations i ON i.invite_code=x.invite_code
   WHERE x.network=p_network
     AND i.activation_network=p_network
     AND i.reward_cohort_round_id=p_reward_cohort_round_id
     AND i.reward_funding_allocation_receipt_id=p_receipt_id
     AND i.activated_at>=v_rollout
     AND x.invalidated_at IS NULL
     AND x.submission_state NOT IN ('REJECTED','INVALIDATED','CANCELLED')
 );
END$new$;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO fn
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname='reward_elastic_source_has_unsettled_slots_v1';
 IF fn IS NULL OR strpos(fn,old_tail)=0 OR
    strpos(fn,'72 hours')>0
 THEN RAISE EXCEPTION 'ELASTIC_X_SWEEP_WINDOW_SOURCE_DRIFT'; END IF;
 EXECUTE replace(fn,old_tail,new_tail);
END $patch$;
COMMIT;
