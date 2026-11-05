-- No Source Sweep can reclaim funds of a pending future elastic invite.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 disallowed boolean;
 c bigint;
BEGIN
 IF public.reward_elastic_source_has_unsettled_slots_v1('mainnet',app,125,1003) THEN
  RAISE EXCEPTION 'Default OFF source guard unexpectedly active'; END IF;
 SELECT count(*) INTO c FROM public.read_reward_boost_reserve_unprotected_sources('mainnet',app)
 WHERE allocation_receipt_id=1003;
 IF c<>1 THEN RAISE EXCEPTION 'Normal source discovery baseline was modified'; END IF;
 UPDATE reward_admission_bridge.elastic_settlement_settings SET
  enabled=true,rollout_not_before=now()-interval '8 days',
  allow_protected_partial_settlement=true WHERE id=1;
 UPDATE public.invitations SET status='CANCELLED',sybil_status='BLOCKED',
  reward_status='FORFEITED' WHERE invite_code='ELASTIC-OLDUSER';
 IF NOT public.reward_elastic_source_has_unsettled_slots_v1('mainnet',app,125,1003)
 THEN RAISE EXCEPTION 'Incomplete future slot not detected'; END IF;
 SELECT count(*) INTO c FROM public.read_reward_boost_reserve_unprotected_sources('mainnet',app)
 WHERE allocation_receipt_id=1003;
 IF c<>0 THEN RAISE EXCEPTION 'Potential budget was offered to source sweeper'; END IF;
 disallowed:=false;
 BEGIN
  PERFORM public.read_reward_boost_reserve_source_candidate('mainnet',app,125,1003);
 EXCEPTION WHEN raise_exception THEN
  IF sqlerrm='ELASTIC_COHORT_PENDING_MONEY_PROTECTED' THEN disallowed:=true; END IF;
 END;
 IF NOT disallowed THEN RAISE EXCEPTION 'Direct source sweep bypassed unswept guard'; END IF;
 UPDATE public.invitations SET status='CANCELLED',sybil_status='BLOCKED',
  reward_status='FORFEITED'
 WHERE invite_code IN ('ELASTIC-USER1','ELASTIC-USER2','ELASTIC-UNFIN');
 IF public.reward_elastic_source_has_unsettled_slots_v1('mainnet',app,125,1003)
 THEN RAISE EXCEPTION 'Entirely terminal cohort remained blocked'; END IF;
 SELECT count(*) INTO c FROM public.read_reward_boost_reserve_unprotected_sources('mainnet',app)
 WHERE allocation_receipt_id=1003;
 IF c<>1 THEN RAISE EXCEPTION 'Fully terminal funds were not recyclable'; END IF;
 IF has_function_privilege('anon',
   'public.reward_elastic_source_has_unsettled_slots_v1(text,text,bigint,bigint)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.reward_elastic_source_has_unsettled_slots_v1(text,text,bigint,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'Protected source helper leaked browser privileges'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS no source sweep can steal future incomplete or unclaimed elastic money' AS result;
