-- Disposable PostgreSQL 17 only; never run against Production.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.invitations(
 invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,
 activation_network,status,sybil_status
) VALUES
 ('TERM-BLOCK-001',123,1001,'mainnet','ACTIVATING','BLOCKED'),
 ('TERM-REVIEW-002',123,1001,'mainnet','UNDER_REVIEW','NOT_CHECKED');
INSERT INTO reward_admission_bridge.holds
 (network,invite_code,app_id,reward_cohort_round_id,
  funding_allocation_receipt_id,amount_wei,status)
VALUES
 ('mainnet','TERM-BLOCK-001',
  '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
  123,1001,6000000000000000000,'HELD'),
 ('mainnet','TERM-REVIEW-002',
  '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
  123,1001,4000000000000000000,'HELD');
DO $qa$
DECLARE
 v jsonb;
 b_physical numeric;
 b_cohort numeric;
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
BEGIN
 IF has_function_privilege('anon','public.release_terminal_reward_admission_held_v1(text,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.release_terminal_reward_admission_held_v1(text,integer)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.release_terminal_reward_admission_held_v1(text,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'Terminal release authority not isolated'; END IF;
 SELECT public.release_terminal_reward_admission_held_v1('mainnet',25) INTO v;
 IF v->>'reason'<>'ADMISSION_RELEASE_DISABLED' THEN
  RAISE EXCEPTION 'Disabled release changed HELD: %',v; END IF;
 UPDATE reward_admission_bridge.settings SET enabled=true WHERE id=1;
 SELECT public.read_outstanding_reward_liability('mainnet',app)::numeric INTO b_physical;
 SELECT public.read_reward_cohort_committed_wei('mainnet',app,123,1001) INTO b_cohort;
 SELECT public.release_terminal_reward_admission_held_v1('mainnet',25) INTO v;
 IF v->>'reason'<>'TERMINAL_HELD_SWEEP_COMPLETE'
 OR (v->>'released')::integer<>1
 OR v->>'releasedWei'<>'6000000000000000000'
 THEN RAISE EXCEPTION 'Invalid blocked-only HELD batch result: %',v; END IF;
 IF (SELECT status FROM reward_admission_bridge.holds
      WHERE invite_code='TERM-BLOCK-001')<>'RELEASED'
 OR (SELECT status FROM reward_admission_bridge.holds
      WHERE invite_code='TERM-REVIEW-002')<>'HELD'
 THEN RAISE EXCEPTION 'Active or blocked HELD changed incorrectly'; END IF;
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>b_physical-6000000000000000000
 OR public.read_reward_cohort_committed_wei('mainnet',app,123,1001)
   <>b_cohort-6000000000000000000 THEN
  RAISE EXCEPTION 'Terminal release violated exact liability delta'; END IF;
 SELECT public.release_terminal_reward_admission_held_v1('mainnet',25) INTO v;
 IF (v->>'released')::integer<>0 THEN
  RAISE EXCEPTION 'Terminal release replay double-freed a guarantee'; END IF;
END $qa$;
ROLLBACK;
DO $verify$
BEGIN
 IF (SELECT enabled FROM reward_admission_bridge.settings WHERE id=1)
 OR EXISTS(SELECT 1 FROM reward_admission_bridge.holds WHERE invite_code='TERM-BLOCK-001')
 THEN RAISE EXCEPTION 'Fake terminal release persisted'; END IF;
END $verify$;
SELECT 'PASS blocked-only exact-once terminal HELD and repeat safety' result;
