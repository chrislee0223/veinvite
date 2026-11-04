-- DISPOSABLE GitHub PostgreSQL ONLY; fake invitation and token amounts.
-- Verify no live permissions, atomic checks, cohort accounting and replay.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.invitations(
 invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,
 activation_network,status,sybil_status
) VALUES ('ADMIT-LAB-123',123,1001,'mainnet','ACTIVATING','NOT_CHECKED');

DO $qa$
DECLARE r jsonb;
 e constant numeric:=power(10::numeric,18);
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_physical numeric(78,0);
 v_cohort numeric(78,0);
BEGIN
 IF (SELECT enabled FROM reward_admission_bridge.settings WHERE id=1)
 OR has_function_privilege('service_role',
  'reward_admission_bridge.lab_admit_hold_v1(text,text,numeric,numeric,numeric,numeric,numeric,bigint)',
  'EXECUTE')
 THEN RAISE EXCEPTION 'LAB admission writer exposed outside sandbox'; END IF;
 SELECT reward_admission_bridge.lab_admit_hold_v1(
  'ADMIT-LAB-123','mainnet',6*e,100*e,0,0,5*e,100) INTO r;
 IF r->>'reason'<>'ADMISSION_HOLD_DISABLED' THEN
  RAISE EXCEPTION 'Hard-disabled writer accepted a hold: %',r; END IF;
 UPDATE reward_admission_bridge.settings SET enabled=true WHERE id=1;
 SELECT public.read_outstanding_reward_liability('mainnet',app)::numeric INTO v_physical;
 SELECT public.read_reward_cohort_committed_wei('mainnet',app,123,1001) INTO v_cohort;

 SELECT reward_admission_bridge.lab_admit_hold_v1(
  'ADMIT-LAB-123','mainnet',6*e,100*e,v_physical+1,v_cohort,5*e,100) INTO r;
 IF r->>'reason'<>'RECALCULATE' THEN
  RAISE EXCEPTION 'Stale quote was accepted: %',r; END IF;

 SELECT reward_admission_bridge.lab_admit_hold_v1(
  'ADMIT-LAB-123','mainnet',6*e,v_physical+11*e-1,
  v_physical,v_cohort,5*e,100) INTO r;
 IF r->>'reason'<>'UNDERFUNDED' THEN
  RAISE EXCEPTION 'Stress-floor collateral breach was accepted: %',r; END IF;

 SELECT reward_admission_bridge.lab_admit_hold_v1(
  'ADMIT-LAB-123','mainnet',6*e,100*e,v_physical,v_cohort,5*e,100) INTO r;
 IF r->>'reason'<>'HELD' OR r->>'guaranteedWei'<>(6*e)::text THEN
  RAISE EXCEPTION 'Valid lab reservation rejected: %',r; END IF;
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>v_physical+6*e
 OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)<>v_cohort+6*e THEN
  RAISE EXCEPTION 'New HELD not counted exactly once in physical/cohort'; END IF;

 SELECT reward_admission_bridge.lab_admit_hold_v1(
  'ADMIT-LAB-123','mainnet',6*e,100*e,v_physical+6*e,v_cohort+6*e,5*e,100) INTO r;
 IF r->>'reason'<>'HOLD_ALREADY_EXISTS'
 OR (SELECT count(*) FROM reward_admission_bridge.holds
     WHERE invite_code='ADMIT-LAB-123')<>1 THEN
  RAISE EXCEPTION 'Replay committed multiple holds: %',r; END IF;

 INSERT INTO public.invitations(
  invite_code,activation_network,status,sybil_status
 ) VALUES ('ADMIT-PENDING-123','mainnet','PENDING_ACCEPTANCE','NOT_CHECKED');
 SELECT reward_admission_bridge.lab_admit_hold_v1(
  'ADMIT-PENDING-123','mainnet',6*e,100*e,v_physical+6*e,v_cohort+6*e,5*e,100) INTO r;
 IF r->>'reason'<>'INELIGIBLE_OR_RESTRICTED' THEN
  RAISE EXCEPTION 'Unbound pending acceptance admitted: %',r; END IF;
END $qa$;
ROLLBACK;
DO $verify$
BEGIN
 IF (SELECT enabled FROM reward_admission_bridge.settings WHERE id=1)
 OR EXISTS(SELECT 1 FROM reward_admission_bridge.holds WHERE invite_code='ADMIT-LAB-123')
 OR EXISTS(SELECT 1 FROM public.invitations WHERE invite_code='ADMIT-LAB-123')
 THEN RAISE EXCEPTION 'Disposable hold-writer lab transaction was not rolled back'; END IF;
END $verify$;
SELECT 'PASS: writer is disabled; fake valid, stale, underfunded, replay and unbound states are safe' result;
