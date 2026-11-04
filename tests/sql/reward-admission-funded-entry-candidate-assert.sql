-- Disposable PostgreSQL only; no Production holds or rewards.
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE public.invitations
 ADD COLUMN IF NOT EXISTS activated_at timestamptz,
 ADD COLUMN IF NOT EXISTS activation_block bigint,
 ADD COLUMN IF NOT EXISTS eligibility_check_id bigint,
 ADD COLUMN IF NOT EXISTS ineligible_at timestamptz,
 ADD COLUMN IF NOT EXISTS slot_released_at timestamptz,
 ADD COLUMN IF NOT EXISTS reward_eligible_at timestamptz;
INSERT INTO public.invitations(
 invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,
 activation_network,status,sybil_status,activated_at,activation_block,eligibility_check_id
) VALUES (
 'ADMIT-ENTRY-123',123,1001,'mainnet','ACTIVATING','NOT_CHECKED',now(),88,1
),(
 'ADMIT-PENDING-234',NULL,NULL,'mainnet','PENDING_ACCEPTANCE','NOT_CHECKED',NULL,NULL,NULL
);
DO $qa$
DECLARE
 e constant numeric:=power(10::numeric,18);
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 r jsonb;
 p_before numeric(78,0);
 c_before numeric(78,0);
 failed boolean;
BEGIN
 IF has_function_privilege('service_role',
  'reward_admission_bridge.qa_funded_activate_held_v1(text,text,numeric,numeric,numeric,numeric,numeric,bigint,timestamptz)',
  'EXECUTE')
 THEN RAISE EXCEPTION 'Candidate function wrongly exposed to live server'; END IF;
 IF has_function_privilege('anon',
  'public.create_reward_admission_hold_v1(text,text,numeric,numeric,numeric,numeric,numeric,bigint,timestamptz)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.create_reward_admission_hold_v1(text,text,numeric,numeric,numeric,numeric,numeric,bigint,timestamptz)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.create_reward_admission_hold_v1(text,text,numeric,numeric,numeric,numeric,numeric,bigint,timestamptz)','EXECUTE')
 THEN RAISE EXCEPTION 'Service admission gateway role isolation violated'; END IF;
 SELECT reward_admission_bridge.qa_funded_activate_held_v1(
  'ADMIT-ENTRY-123','mainnet',6*e,1000*e,0,0,10*e,100,now()) INTO r;
 IF r->>'reason'<>'ADMISSION_HOLD_DISABLED'
 THEN RAISE EXCEPTION 'Disabled candidate admitted funds: %',r; END IF;
 UPDATE reward_admission_bridge.settings SET enabled=true WHERE id=1;
 SELECT public.read_outstanding_reward_liability('mainnet',app)::numeric INTO p_before;
 SELECT public.read_reward_cohort_committed_wei('mainnet',app,123,1001) INTO c_before;

 failed:=false;
 BEGIN
 PERFORM reward_admission_bridge.qa_funded_activate_held_v1(
  'ADMIT-ENTRY-123','mainnet',6*e,1000*e,p_before,c_before,10*e,100,
  now()-interval '5 minutes');
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%ADMISSION_HOLD_INPUT_INVALID%'
  THEN failed:=true; ELSE RAISE; END IF;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'Stale onchain quote accepted'; END IF;

 SELECT reward_admission_bridge.qa_funded_activate_held_v1(
  'ADMIT-ENTRY-123','mainnet',6*e,1000*e,p_before,c_before,10*e,80,now()) INTO r;
 IF r->>'reason'<>'INELIGIBLE_OR_RESTRICTED'
 THEN RAISE EXCEPTION 'Unfinalized activation admitted: %',r; END IF;

 SELECT reward_admission_bridge.qa_funded_activate_held_v1(
  'ADMIT-ENTRY-123','mainnet',6*e,p_before+15*e-1,p_before,c_before,10*e,100,now()) INTO r;
 IF r->>'reason'<>'UNDERFUNDED'
 THEN RAISE EXCEPTION 'Stress-buffer underfunded admission allowed: %',r; END IF;

 SELECT reward_admission_bridge.qa_funded_activate_held_v1(
  'ADMIT-PENDING-234','mainnet',6*e,1000*e,p_before,c_before,10*e,100,now()) INTO r;
 IF r->>'reason'<>'INELIGIBLE_OR_RESTRICTED'
 THEN RAISE EXCEPTION 'Unaccepted referral admitted: %',r; END IF;

 SELECT public.create_reward_admission_hold_v1(
  'ADMIT-ENTRY-123','mainnet',6*e,1000*e,p_before,c_before,10*e,100,now()) INTO r;
 IF r->>'reason'<>'HELD' OR r->>'guaranteedWei'<>(6*e)::text
 THEN RAISE EXCEPTION 'Valid fully funded QA hold denied: %',r; END IF;
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>p_before+6*e
 OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>c_before+6*e
 THEN RAISE EXCEPTION 'Funded HELD amount was not counted once'; END IF;

 SELECT reward_admission_bridge.qa_funded_activate_held_v1(
  'ADMIT-ENTRY-123','mainnet',6*e,1000*e,p_before+6*e,c_before+6*e,10*e,100,now()) INTO r;
 IF r->>'reason'<>'HOLD_ALREADY_EXISTS' THEN
  RAISE EXCEPTION 'Replayed admission duplicated obligation: %',r; END IF;
END $qa$;
ROLLBACK;
DO $check$
BEGIN
 IF (SELECT enabled FROM reward_admission_bridge.settings WHERE id=1)
 OR EXISTS(SELECT 1 FROM reward_admission_bridge.holds WHERE invite_code='ADMIT-ENTRY-123')
 OR EXISTS(SELECT 1 FROM public.invitations WHERE invite_code='ADMIT-ENTRY-123')
 THEN RAISE EXCEPTION 'Staged entry test leaked fake financial state'; END IF;
END $check$;
SELECT 'PASS fresh-finality, strict funding, disabled policy, replay and rollback' result;
