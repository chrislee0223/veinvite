\set ON_ERROR_STOP on
DO $checkpoint$
DECLARE r jsonb; i public.invitations%rowtype; old_count integer;
BEGIN
 -- The previous isolated suite ended with the settings OFF.
 SELECT public.publish_mission_retry_completion_checkpoint_v1('mainnet','EDFW4Y7',2) INTO r;
 IF r->>'reason'<>'FEATURE_DISABLED' THEN RAISE EXCEPTION 'Disabled publisher wrote: %',r; END IF;
 UPDATE reward_admission_bridge.mission_auto_reset_settings_v1 SET enabled=true WHERE id=1;
 SELECT public.publish_mission_retry_completion_checkpoint_v1('mainnet','EDFW4Y7',1) INTO r;
 IF r->>'reason'<>'STALE_ATTEMPT' THEN RAISE EXCEPTION 'Stale attempt published: %',r; END IF;
 IF (SELECT count(*) FROM public.read_mission_effective_proof_events_v1('EDFW4Y7','mainnet'))<>5
   OR EXISTS(SELECT 1 FROM public.read_mission_effective_proof_events_v1('EDFW4Y7','mainnet') WHERE block_number<3000)
 THEN RAISE EXCEPTION 'Old events leaked into canonical eligibility'; END IF;
 IF (SELECT count(*) FROM public.read_mission_effective_proof_events_v1('ACXKGKC','mainnet'))<>1
 THEN RAISE EXCEPTION 'Legacy proof reader changed'; END IF;
 SELECT public.publish_mission_retry_completion_checkpoint_v1('mainnet','EDFW4Y7',2) INTO r;
 IF r->>'published'<>'true' OR r->>'completionRoundId'<>'129'
 THEN RAISE EXCEPTION 'New checkpoint failed: %',r; END IF;
 SELECT * INTO i FROM public.invitations WHERE invite_code='EDFW4Y7';
 IF i.status<>'ACTIVATING' OR i.reward_status<>'PENDING'
  OR i.reward_cohort_round_id<>124 OR i.vote_round_id<>129
  OR i.vote_completed_block<>4001 OR i.activation_block<>100 OR i.apps_completed<>3
  OR i.vot3_converted IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Canonical checkpoint mutated identity/payment or wrong proof'; END IF;
 SELECT public.publish_mission_retry_completion_checkpoint_v1('mainnet','EDFW4Y7',2) INTO r;
 IF r->>'reused'<>'true' THEN RAISE EXCEPTION 'Repeated checkpoint not idempotent: %',r; END IF;
 BEGIN
   UPDATE public.invitations SET status='COMPLETED',reward_status='ELIGIBLE',sybil_status='CLEAR',
     sybil_checked_at=clock_timestamp() WHERE invite_code='EDFW4Y7';
   RAISE EXCEPTION 'UNAPPROVED_RETRY_PROMOTED';
 EXCEPTION WHEN others THEN
   IF SQLERRM<>'MISSION_RETRY_CANONICAL_PAYOUT_NOT_ENABLED' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.reward_queue_entries WHERE invite_code='EDFW4Y7')
 OR EXISTS(SELECT 1 FROM public.reward_payouts WHERE invite_code='EDFW4Y7')
 THEN RAISE EXCEPTION 'Checkpoint moved money'; END IF;
 UPDATE reward_admission_bridge.mission_auto_reset_settings_v1 SET enabled=false WHERE id=1;
END;
$checkpoint$;
SELECT 'mission-retry-canonical-checkpoint-qa-pass' AS result;
