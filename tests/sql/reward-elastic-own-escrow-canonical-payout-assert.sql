-- Full lifecycle: writer converts its own escrow exactly once while
-- the universal physical reader keeps it unavailable to OTHER payers.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 e numeric := power(10::numeric,18);
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 first numeric := floor((1000*power(10::numeric,18)-30*power(10::numeric,18))/3);
 second numeric;
 r jsonb;
 reserved_before numeric;
 reserved_after numeric;
BEGIN
 UPDATE reward_admission_bridge.elastic_settlement_settings
 SET enabled=true,allow_protected_partial_settlement=true,
     rollout_not_before=now()-interval '8 days' WHERE id=1;
 UPDATE public.invitations
 SET status='CANCELLED',sybil_status='BLOCKED',reward_status='FORFEITED'
 WHERE invite_code='ELASTIC-OLDUSER';
 SELECT public.read_outstanding_reward_liability('mainnet',app)::numeric INTO reserved_before;
 SELECT public.commit_reward_elastic_closed_cohort_v1(
 'ELASTIC-USER1','mainnet',1800*e,now(),1000,900*e,'{}') INTO r;
 IF r->>'mode'<>'ELASTIC' OR r->>'reserved'<>'true'
 OR r->>'elasticGrossWei'<>first::text
 THEN RAISE EXCEPTION 'Own escrow double-counted or first payout missing: %',r; END IF;
 SELECT public.read_outstanding_reward_liability('mainnet',app)::numeric INTO reserved_after;
 IF reserved_before<>reserved_after THEN
 RAISE EXCEPTION 'First payout failed to atomically transfer a contingent hold to queue'; END IF;
 second:=floor((1000*e-first-30*e)/2);
 SELECT public.commit_reward_elastic_closed_cohort_v1(
 'ELASTIC-USER2','mainnet',1800*e,now(),1000,900*e,'{}') INTO r;
 IF r->>'mode'<>'ELASTIC' OR r->>'reserved'<>'true'
 OR r->>'elasticGrossWei'<>second::text
 THEN RAISE EXCEPTION 'Second reservation overran the protected budget: %',r; END IF;
 SELECT public.read_outstanding_reward_liability('mainnet',app)::numeric INTO reserved_after;
 IF reserved_before<>reserved_after THEN
 RAISE EXCEPTION 'Second payout changed total physical liabilities before actual Claim'; END IF;
 IF (SELECT status FROM public.invitations WHERE invite_code='ELASTIC-UNFIN')<>'ACTIVATING'
 THEN RAISE EXCEPTION 'Pending invitation status was modified'; END IF;
 SELECT public.commit_reward_elastic_closed_cohort_v1(
 'ELASTIC-USER1','mainnet',1800*e,now(),1000,900*e,'{}') INTO r;
 IF r->>'reason'<>'ALREADY_FIXED' THEN
 RAISE EXCEPTION 'Canonical writer allowed replay after elastic hold conversion: %',r;
 END IF;
END $test$;
ROLLBACK;
SELECT 'PASS own cohort escrow counted once, all other liabilities ring-fenced' result;
