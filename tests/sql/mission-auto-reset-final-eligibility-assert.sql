\set ON_ERROR_STOP on
DO $eligibility$
DECLARE r jsonb; checks jsonb:='["HISTORICAL_CHAIN","FUNDING_CHAIN","MISSION_BEHAVIOR","SECURITY_IDENTITY","VEPASSPORT","CHAIN_FINALITY"]';
BEGIN
 SELECT public.authorize_mission_retry_eligibility_v1('mainnet','EDFW4Y7',1) INTO r;
 IF r->>'reason'<>'FEATURE_DISABLED' THEN RAISE EXCEPTION 'Disabled gate failed: %',r; END IF;
 UPDATE reward_admission_bridge.mission_auto_reset_settings_v1 SET enabled=true WHERE id=1;
 DELETE FROM public.sybil_v2_referral_assessments WHERE invite_code='EDFW4Y7';
 INSERT INTO public.sybil_v2_referral_assessments(invite_code,network,state,revision,evidence_cutoff_block,assessed_at,evidence_summary,completed_checks,required_checks,risk_score)
 VALUES('EDFW4Y7','mainnet','CLEAR',5,4100,clock_timestamp(),'{}',checks,checks,0);
 SELECT public.authorize_mission_retry_eligibility_v1('mainnet','EDFW4Y7',5) INTO r;
 IF r->>'reason'<>'CURRENT_CLEAR_ASSESSMENT_REQUIRED' THEN RAISE EXCEPTION 'Old assessment accepted: %',r; END IF;
 UPDATE public.sybil_v2_referral_assessments SET evidence_summary='{"missionRetryAttemptNo":2,"missionRetryCompletionBlock":4001}',completed_checks=checks-'CHAIN_FINALITY' WHERE invite_code='EDFW4Y7';
 SELECT public.authorize_mission_retry_eligibility_v1('mainnet','EDFW4Y7',5) INTO r;
 IF r->>'reason'<>'CURRENT_CLEAR_ASSESSMENT_REQUIRED' THEN RAISE EXCEPTION 'Missing finality accepted: %',r; END IF;
 UPDATE public.sybil_v2_referral_assessments SET completed_checks=checks,state='HOLD' WHERE invite_code='EDFW4Y7';
 SELECT public.authorize_mission_retry_eligibility_v1('mainnet','EDFW4Y7',5) INTO r;
 IF r->>'reason'<>'CURRENT_CLEAR_ASSESSMENT_REQUIRED' THEN RAISE EXCEPTION 'HOLD accepted: %',r; END IF;
 UPDATE public.sybil_v2_referral_assessments SET state='CLEAR' WHERE invite_code='EDFW4Y7';
 SELECT public.authorize_mission_retry_eligibility_v1('mainnet','EDFW4Y7',4) INTO r;
 IF r->>'reason'<>'STALE_ASSESSMENT' THEN RAISE EXCEPTION 'Old revision accepted: %',r; END IF;
 SELECT public.authorize_mission_retry_eligibility_v1('mainnet','EDFW4Y7',5) INTO r;
 IF r->>'reason'<>'IDENTITY_OR_ELIGIBILITY_PENDING' THEN RAISE EXCEPTION 'Missing identity accepted: %',r; END IF;
 UPDATE public.invitations SET identity_link_status='NO_KNOWN_LINK',
   identity_link_checked_at=clock_timestamp(),identity_link_policy_version='security_client_v2',
   identity_link_evidence='{"observedClientCount":1}' WHERE invite_code='EDFW4Y7';
 SELECT public.authorize_mission_retry_eligibility_v1('mainnet','EDFW4Y7',5) INTO r;
 IF r->>'eligible'<>'true' THEN RAISE EXCEPTION 'Valid completed retry not eligible: %',r; END IF;
 SELECT public.authorize_mission_retry_eligibility_v1('mainnet','EDFW4Y7',5) INTO r;
 IF r->>'reused'<>'true' THEN RAISE EXCEPTION 'Repeated eligibility not idempotent: %',r; END IF;
 IF EXISTS(SELECT 1 FROM public.reward_queue_entries WHERE invite_code='EDFW4Y7')
  OR EXISTS(SELECT 1 FROM public.reward_payouts WHERE invite_code='EDFW4Y7')
  OR (SELECT reward_cohort_round_id FROM public.invitations WHERE invite_code='EDFW4Y7')<>124
 THEN RAISE EXCEPTION 'Eligibility altered money or entry binding'; END IF;
 UPDATE reward_admission_bridge.mission_auto_reset_settings_v1 SET enabled=false WHERE id=1;
END;
$eligibility$;
SELECT 'mission-retry-final-eligibility-qa-pass' AS result;
