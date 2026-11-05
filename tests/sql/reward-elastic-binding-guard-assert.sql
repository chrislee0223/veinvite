\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 blocked boolean:=false;
BEGIN
 -- Existing app behavior while the partial-activation switch is OFF.
 INSERT INTO public.invitations(invite_code,activation_network,activated_at,status)
 VALUES('ELASTIC-UNBOUND','mainnet',now(),'ACTIVATING');
 IF NOT EXISTS (SELECT 1 FROM public.invitations
   WHERE invite_code='ELASTIC-UNBOUND' AND reward_cohort_round_id IS NULL)
 THEN RAISE EXCEPTION 'Disabled staging incorrectly rejected older behavior'; END IF;
 DELETE FROM public.invitations WHERE invite_code='ELASTIC-UNBOUND';
 UPDATE reward_admission_bridge.elastic_settlement_settings
 SET enabled=true,allow_protected_partial_settlement=true,
     rollout_not_before=now()-interval '8 days' WHERE id=1;
 BEGIN
  INSERT INTO public.invitations(invite_code,activation_network,activated_at,status)
  VALUES('ELASTIC-UNBOUND','mainnet',now(),'ACTIVATING');
 EXCEPTION WHEN raise_exception THEN
   IF sqlerrm='ELASTIC_ROLLOUT_REQUIRES_CANONICAL_FUNDING_RECEIPT'
   THEN blocked:=true; END IF;
 END;
 IF NOT blocked OR EXISTS(
  SELECT 1 FROM public.invitations WHERE invite_code='ELASTIC-UNBOUND')
 THEN RAISE EXCEPTION 'Unbound future accepted referral escaped funding guard'; END IF;
 INSERT INTO public.invitations(invite_code,activation_network,activated_at,status,
  reward_cohort_round_id,reward_funding_allocation_receipt_id)
 VALUES('ELASTIC-BOUND','mainnet',now(),'ACTIVATING',125,1003);
 IF NOT EXISTS (SELECT 1 FROM public.invitations
   WHERE invite_code='ELASTIC-BOUND'
     AND reward_cohort_round_id=125 AND reward_funding_allocation_receipt_id=1003)
 THEN RAISE EXCEPTION 'Bound future invite was rejected'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS future rollout rejects only unbound accepted invites and keeps old user safety' result;
