-- Confirmed Sybil BLOCKED is not a potential 3rd winner. Pending and
-- NOT_CHECKED (not blocked) must still retain the entire option.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 e numeric:=power(10::numeric,18);
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 result jsonb;
 health jsonb;
BEGIN
 UPDATE reward_admission_bridge.elastic_settlement_settings
 SET enabled=true,allow_protected_partial_settlement=true,
     rollout_not_before=now()-interval '8 days' WHERE id=1;
 UPDATE public.invitations
 SET status='CANCELLED',sybil_status='BLOCKED',reward_status='FORFEITED'
 WHERE invite_code='ELASTIC-OLDUSER';
 UPDATE public.invitations
 SET sybil_status='BLOCKED'
 WHERE invite_code='ELASTIC-UNFIN';
 IF (SELECT status FROM public.invitations WHERE invite_code='ELASTIC-UNFIN')<>'ACTIVATING'
 THEN RAISE EXCEPTION 'Test incorrectly canceled blocked user'; END IF;
 health:=public.read_reward_elastic_closure_liveness_v1('mainnet',app);
 IF (health->>'unfinishedInClosedCohorts')::integer<>0
 THEN RAISE EXCEPTION 'BLOCKED user was wrongly counted as pending: %',health; END IF;
 SELECT public.commit_reward_elastic_closed_cohort_v1(
  'ELASTIC-USER1','mainnet',1800*e,now(),1000,900*e,'{}') INTO result;
 IF result->>'mode'<>'ELASTIC'
   OR result->>'reserved'<>'true'
   OR result->>'elasticGrossWei'<>(490*e)::text
 THEN RAISE EXCEPTION 'BLOCKED Sybil incorrectly reduced clean 2-winner award: %',result; END IF;
 -- An *entirely* BLOCKED other cohort must not permanently encumber the
 -- common pool or suppress legitimate source rollover.
 UPDATE public.vebetter_round_allocations SET rewards_allocation_amount_wei=500*e
 WHERE id=1002;
 INSERT INTO public.invitations(
  invite_code,activation_network,activated_at,status,sybil_status,
  reward_cohort_round_id,reward_funding_allocation_receipt_id)
 VALUES('ELASTIC-ONLY-BLOCKED','mainnet',now()-interval '4 days',
  'ACTIVATING','BLOCKED',124,1002);
 IF public.read_reward_elastic_contingent_scope_liability_wei_v1(
    'mainnet',app,124,1002)<>0
 THEN RAISE EXCEPTION 'BLOCKED-only cohort allocated physical liability'; END IF;
 IF public.reward_elastic_source_has_unsettled_slots_v1(
   'mainnet',app,124,1002)
 THEN RAISE EXCEPTION 'BLOCKED-only cohort stopped source recycle'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS BLOCKED excludes invalid recipients, while real incomplete keep X/Claim protection' result;
