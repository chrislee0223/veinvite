-- Disposable PostgreSQL only; no real invitations or financial changes.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.invitations(
 invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,
 activation_network,status,sybil_status
) VALUES
 ('INVALID-BLOCKED',123,1001,'mainnet','ACTIVATING','BLOCKED'),
 ('INVALID-REVIEW',123,1001,'mainnet','UNDER_REVIEW','NOT_CHECKED'),
 ('INVALID-FIXED',123,1001,'mainnet','COMPLETED','BLOCKED'),
 ('INVALID-CONVERT',123,1001,'mainnet','COMPLETED','BLOCKED');
-- Model a historical drifted fixed payout BEFORE an already-held row.
-- The new DB trigger rightly blocks creation in the other direction.
INSERT INTO public.reward_queue_entries(invite_code,network,reserved_amount_wei,status)
VALUES('INVALID-FIXED','mainnet',6*power(10::numeric,18),'AWAITING_CLAIM');

INSERT INTO reward_admission_bridge.holds(
 network,invite_code,app_id,reward_cohort_round_id,funding_allocation_receipt_id,
 amount_wei,status
) SELECT 'mainnet', code,
 '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
 123,1001,6*power(10::numeric,18),st
 FROM (VALUES
   ('INVALID-BLOCKED','HELD'),
   ('INVALID-REVIEW','HELD'),
   ('INVALID-FIXED','HELD'),
   ('INVALID-CONVERT','CONVERTED')
 ) AS fake(code,st);
DO $test$
DECLARE
  v jsonb;
  before_physical numeric(78,0);
  before_cohort numeric(78,0);
  app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  e numeric:=power(10::numeric,18);
BEGIN
  IF has_function_privilege('service_role',
     'reward_admission_bridge.lab_release_invalid_hold_v1(text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Lab release exposed to service_role'; END IF;
  SELECT reward_admission_bridge.lab_release_invalid_hold_v1('INVALID-BLOCKED','mainnet') INTO v;
  IF v->>'reason'<>'ADMISSION_RELEASE_DISABLED' THEN
     RAISE EXCEPTION 'Production-style release not disabled: %',v; END IF;
  UPDATE reward_admission_bridge.settings SET enabled=true WHERE id=1;
  SELECT public.read_outstanding_reward_liability('mainnet',app)::numeric INTO before_physical;
  SELECT public.read_reward_cohort_committed_wei('mainnet',app,123,1001) INTO before_cohort;

  SELECT reward_admission_bridge.lab_release_invalid_hold_v1('INVALID-REVIEW','mainnet') INTO v;
  IF v->>'reason'<>'INVITATION_NOT_FINAL_INVALID' THEN
    RAISE EXCEPTION 'Unreviewed active referral lost guarantee: %',v; END IF;
  SELECT reward_admission_bridge.lab_release_invalid_hold_v1('INVALID-FIXED','mainnet') INTO v;
  IF v->>'reason'<>'FIXED_REWARD_EXISTS' THEN
    RAISE EXCEPTION 'Existing fixed reward was released: %',v; END IF;
  SELECT reward_admission_bridge.lab_release_invalid_hold_v1('INVALID-CONVERT','mainnet') INTO v;
  IF v->>'reason'<>'HOLD_ALREADY_FINAL' THEN
    RAISE EXCEPTION 'Converted reward was released again: %',v; END IF;

  SELECT reward_admission_bridge.lab_release_invalid_hold_v1('INVALID-BLOCKED','mainnet') INTO v;
  IF v->>'reason'<>'INVALID_HOLD_RELEASED' OR v->>'releasedWei'<>(6*e)::text THEN
    RAISE EXCEPTION 'Blocked invite hold was not released correctly: %',v; END IF;
  IF (SELECT status FROM reward_admission_bridge.holds WHERE invite_code='INVALID-BLOCKED')<>'RELEASED'
  OR public.read_outstanding_reward_liability('mainnet',app)::numeric<>before_physical-6*e
  OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>before_cohort-6*e
  THEN RAISE EXCEPTION 'Release did not reconcile one-for-one'; END IF;
  SELECT reward_admission_bridge.lab_release_invalid_hold_v1('INVALID-BLOCKED','mainnet') INTO v;
  IF v->>'reason'<>'HOLD_ALREADY_FINAL'
   OR public.read_outstanding_reward_liability('mainnet',app)::numeric<>before_physical-6*e
  THEN RAISE EXCEPTION 'Replay released a hold twice: %',v; END IF;
END $test$;
ROLLBACK;
DO $verify$
BEGIN
 IF (SELECT enabled FROM reward_admission_bridge.settings WHERE id=1)
 OR EXISTS(SELECT 1 FROM reward_admission_bridge.holds WHERE invite_code='INVALID-BLOCKED')
 OR EXISTS(SELECT 1 FROM public.invitations WHERE invite_code='INVALID-BLOCKED')
 THEN RAISE EXCEPTION 'Fake release test did not roll back'; END IF;
END $verify$;
SELECT 'PASS: disabled, blocked-only, active, fixed, converted, replay, and one-time exact release' result;
