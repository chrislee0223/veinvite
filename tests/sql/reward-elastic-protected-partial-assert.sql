-- Disposable PG17: test future-only partial payouts while preserving a
-- still-active, not-yet-completed referral. No user state changes persist.
\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
 e numeric := power(10::numeric,18);
 first_wei numeric;
 second_wei numeric;
 third_wei numeric;
 result jsonb;
 held_total numeric;
 x_protected numeric := 30*power(10::numeric,18);
BEGIN
 IF (SELECT allow_protected_partial_settlement
     FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1)
 THEN RAISE EXCEPTION 'Partial feature must default OFF'; END IF;
 UPDATE reward_admission_bridge.elastic_settlement_settings
   SET enabled=true,allow_protected_partial_settlement=true,
       rollout_not_before=now()-interval '8 days' WHERE id=1;
 -- Ensure the historical invite is excluded only for this synthetic cohort
 -- by evidence-backed terminal status, not by changing the actual pending row.
 UPDATE public.invitations SET status='CANCELLED',sybil_status='BLOCKED',
    reward_status='FORFEITED' WHERE invite_code='ELASTIC-OLDUSER';
 IF (SELECT status FROM public.invitations WHERE invite_code='ELASTIC-UNFIN')
    <>'ACTIVATING' THEN RAISE EXCEPTION 'Unresolved invite was overwritten'; END IF;
 first_wei := floor((1000*e-x_protected)/3);
 SELECT public.commit_reward_elastic_closed_cohort_v1(
   'ELASTIC-USER1','mainnet',2000*e,now(),1000,900*e,'{}') INTO result;
 IF result->>'mode'<>'ELASTIC' OR result->>'reserved'<>'true'
   OR result->>'elasticGrossWei'<>first_wei::text THEN
   RAISE EXCEPTION 'First verified participant was denied or overpaid: %',result;
 END IF;
 IF (SELECT status FROM public.invitations WHERE invite_code='ELASTIC-UNFIN')
    <>'ACTIVATING' THEN RAISE EXCEPTION 'First payout forfeited unfinished user'; END IF;
 second_wei := floor((1000*e-first_wei-x_protected)/2);
 SELECT public.commit_reward_elastic_closed_cohort_v1(
   'ELASTIC-USER2','mainnet',2000*e,now(),1000,900*e,'{}') INTO result;
 IF result->>'mode'<>'ELASTIC' OR result->>'reserved'<>'true'
   OR result->>'elasticGrossWei'<>second_wei::text THEN
   RAISE EXCEPTION 'Second verified participant was denied or overpaid: %',result;
 END IF;
 -- The still-active user completes AFTER both other members got their shares.
 -- This row transition is fake QA data, not an authorization boundary in life.
 UPDATE public.invitations SET status='COMPLETED',sybil_status='CLEAR',
    reward_status='ELIGIBLE',vote_completed=true,reward_eligible_at=now()
    WHERE invite_code='ELASTIC-UNFIN';
 third_wei := floor(1000*e-first_wei-second_wei-x_protected);
 SELECT public.commit_reward_elastic_closed_cohort_v1(
   'ELASTIC-UNFIN','mainnet',2000*e,now(),1000,900*e,'{}') INTO result;
 IF result->>'mode'<>'ELASTIC' OR result->>'reserved'<>'true'
   OR result->>'elasticGrossWei'<>third_wei::text THEN
   RAISE EXCEPTION 'Late completing user lost protected share: %',result;
 END IF;
 SELECT coalesce(sum(reserved_amount_wei),0) INTO held_total FROM public.reward_queue_entries
 WHERE invite_code IN ('ELASTIC-USER1','ELASTIC-USER2','ELASTIC-UNFIN');
 IF held_total + x_protected >1000*e THEN
   RAISE EXCEPTION 'Base/X aggregate exceeds canonical budget'; END IF;
 SELECT public.commit_reward_elastic_closed_cohort_v1(
   'ELASTIC-USER1','mainnet',2000*e,now(),1000,900*e,'{}') INTO result;
 IF result->>'reason'<>'ALREADY_FIXED' THEN
   RAISE EXCEPTION 'Replay bypassed canonical once-only reservation: %',result;
 END IF;
END $verify$;
ROLLBACK;
DO $final$
BEGIN
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.elastic_settlement_settings
           WHERE id=1 AND allow_protected_partial_settlement) THEN
   RAISE EXCEPTION 'Partial pricing leaked into default OFF settings';
 END IF;
 IF (SELECT status FROM public.invitations WHERE invite_code='ELASTIC-UNFIN')
    <>'ACTIVATING' THEN RAISE EXCEPTION 'QA failed to rollback unfinished referral'; END IF;
END $final$;
SELECT 'PASS partial settlement preserves pending, X, late winner, and once-only transfer' AS result;
