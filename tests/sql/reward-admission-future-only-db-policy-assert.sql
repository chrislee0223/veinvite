-- Disposable PostgreSQL admission gate regression. Never run on Production.
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE public.invitations
 ADD COLUMN IF NOT EXISTS activated_at timestamptz,
 ADD COLUMN IF NOT EXISTS activation_block bigint,
 ADD COLUMN IF NOT EXISTS eligibility_check_id bigint,
 ADD COLUMN IF NOT EXISTS ineligible_at timestamptz,
 ADD COLUMN IF NOT EXISTS slot_released_at timestamptz,
 ADD COLUMN IF NOT EXISTS reward_eligible_at timestamptz;
ALTER TABLE reward_admission_bridge.settings
 DROP CONSTRAINT IF EXISTS settings_enabled_check;
DO $test$
DECLARE
 e constant numeric := power(10::numeric,18);
 r jsonb;
 blocked boolean:=false;
BEGIN
 -- No configured date/amount/stress means the settings row cannot be enabled.
 BEGIN
  UPDATE reward_admission_bridge.settings SET enabled=true WHERE id=1;
 EXCEPTION WHEN check_violation THEN
  blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Missing policy enabled future rewards'; END IF;
 IF (SELECT enabled FROM reward_admission_bridge.settings WHERE id=1)
 THEN RAISE EXCEPTION 'Policy CHECK did not preserve disabled value'; END IF;
 -- A future timestamp is not an active rollout.
 UPDATE reward_admission_bridge.settings SET
  rollout_not_before=now()+interval '1 day',
  guarantee_minimum_wei=6*e,
  stress_reserve_floor_wei=10*e,
  enabled=true
 WHERE id=1;
 SELECT public.create_reward_admission_hold_v1(
  'ADMIT-OLD-1','mainnet',6*e,1000*e,0,0,10*e,100,now()) INTO r;
 IF r->>'reason'<>'ADMISSION_POLICY_NOT_READY' THEN
  RAISE EXCEPTION 'Future rollout was accepted: %',r;
 END IF;
 -- An old accepted invitation is never eligible for new guaranteed holds,
 -- even if a privileged caller supplies a fresh onchain balance.
 INSERT INTO public.invitations(
  invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,
  activation_network,status,sybil_status,activated_at,activation_block,eligibility_check_id
 ) VALUES (
  'ADMIT-OLD-1',123,1001,'mainnet','ACTIVATING','NOT_CHECKED',
  now()-interval '2 day',88,1
 );
 UPDATE reward_admission_bridge.settings SET
  rollout_not_before=now()-interval '5 minutes' WHERE id=1;
 SELECT public.create_reward_admission_hold_v1(
  'ADMIT-OLD-1','mainnet',6*e,1000*e,0,0,5*e,100,now()) INTO r;
 IF r->>'reason'<>'ADMISSION_POLICY_NOT_READY' THEN
  RAISE EXCEPTION 'Lower-than-protected stress was accepted: %',r;
 END IF;
 SELECT public.create_reward_admission_hold_v1(
  'ADMIT-OLD-1','mainnet',6*e,1000*e,0,0,10*e,100,now()) INTO r;
 IF r->>'reason'<>'PRE_ROLLOUT_INVITE' THEN
  RAISE EXCEPTION 'Historical invite received future guarantee: %',r;
 END IF;
 -- The SQL policy and wrapper must remain server-only.
 IF has_function_privilege('anon',
  'public.create_reward_admission_hold_v1(text,text,numeric,numeric,numeric,numeric,numeric,bigint,timestamptz)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.create_reward_admission_hold_v1(text,text,numeric,numeric,numeric,numeric,numeric,bigint,timestamptz)','EXECUTE')
 THEN RAISE EXCEPTION 'Admission writer leaked browser privileges'; END IF;
 IF EXISTS (SELECT 1 FROM reward_admission_bridge.holds WHERE invite_code='ADMIT-OLD-1')
 THEN RAISE EXCEPTION 'Historical hold was financially written'; END IF;
END $test$;
ROLLBACK;
DO $post$
BEGIN
 IF (SELECT enabled FROM reward_admission_bridge.settings WHERE id=1) THEN
  RAISE EXCEPTION 'QA left admission enabled';
 END IF;
 IF EXISTS (SELECT 1 FROM public.invitations WHERE invite_code='ADMIT-OLD-1') THEN
  RAISE EXCEPTION 'QA left a synthetic user';
 END IF;
END $post$;
SELECT 'PASS future-only SQL admission remains hard-disabled and budget guarded' result;
