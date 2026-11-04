-- Disposable PostgreSQL CI-only. This test must never be run on live data.
\set ON_ERROR_STOP on
BEGIN;
DO $roles$
BEGIN
 IF has_function_privilege('anon',
   'public.read_reward_admission_hold_for_reservation_v1(text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.read_reward_admission_hold_for_reservation_v1(text,text)','EXECUTE')
 OR has_function_privilege('anon',
   'public.commit_reward_admission_held_to_fixed_v1(text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.commit_reward_admission_held_to_fixed_v1(text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Handoff gateway exposed to public roles'; END IF;
 IF NOT has_function_privilege('service_role',
   'public.read_reward_admission_hold_for_reservation_v1(text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.commit_reward_admission_held_to_fixed_v1(text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Service-side admission handoff unavailable'; END IF;
END $roles$;

INSERT INTO public.invitations
 (invite_code,reward_cohort_round_id,reward_funding_allocation_receipt_id,
  activation_network,status,sybil_status)
VALUES ('BRIDGE-GATE-RACE',123,1001,'mainnet','COMPLETED','CLEAR');
INSERT INTO reward_admission_bridge.holds
 (network,invite_code,app_id,reward_cohort_round_id,
  funding_allocation_receipt_id,amount_wei,status)
VALUES ('mainnet','BRIDGE-GATE-RACE',
'0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
123,1001,6000000000000000000,'HELD');

DO $assert$
DECLARE
 v jsonb;
 did_block boolean;
BEGIN
 SELECT public.read_reward_admission_hold_for_reservation_v1(
  'BRIDGE-GATE-RACE','mainnet') INTO v;
 IF v->>'status'<>'HELD' OR v->>'guaranteedWei'<>'6000000000000000000'
 OR v->>'cohortRoundId'<>'123' OR v->>'allocationReceiptId'<>'1001'
 OR v->>'admissionEnabled'<>'false'
 THEN RAISE EXCEPTION 'Read-only service hold lookup wrong: %',v; END IF;
 SELECT public.commit_reward_admission_held_to_fixed_v1(
 'BRIDGE-GATE-RACE','mainnet',100000000000000000000,0,
 6000000000000000000,'lab',NULL,123,
 jsonb_build_object('cohortReservedWei','0')) INTO v;
 IF v->>'reason'<>'ADMISSION_HANDOFF_DISABLED'
 THEN RAISE EXCEPTION 'Disabled handoff was executed: %',v; END IF;

 did_block:=false;
 BEGIN
   INSERT INTO public.reward_queue_entries(invite_code,network,reserved_amount_wei,status)
   VALUES('BRIDGE-GATE-RACE','mainnet',6000000000000000000,'AWAITING_CLAIM');
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM LIKE '%LEGACY_REWARD_WRITER_BLOCKED_BY_HELD_GUARANTEE%'
   THEN did_block:=true; ELSE RAISE; END IF;
 END;
 IF NOT did_block THEN RAISE EXCEPTION 'Legacy queue bypassed HELD interlock'; END IF;

 did_block:=false;
 BEGIN
   INSERT INTO public.reward_recovery_settlements
   (id,invite_code,network,offset_amount_wei)
   VALUES(888888,'BRIDGE-GATE-RACE','mainnet',0);
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM LIKE '%LEGACY_REWARD_WRITER_BLOCKED_BY_HELD_GUARANTEE%'
   THEN did_block:=true; ELSE RAISE; END IF;
 END;
 IF NOT did_block THEN RAISE EXCEPTION 'Legacy recovery bypassed HELD interlock'; END IF;

 IF EXISTS(SELECT 1 FROM public.reward_queue_entries WHERE invite_code='BRIDGE-GATE-RACE')
 OR EXISTS(SELECT 1 FROM public.reward_recovery_settlements WHERE invite_code='BRIDGE-GATE-RACE')
 THEN RAISE EXCEPTION 'Rejected legacy writer retained financial artifacts'; END IF;

 UPDATE reward_admission_bridge.holds SET status='CONVERTED'
 WHERE invite_code='BRIDGE-GATE-RACE';
 INSERT INTO public.reward_queue_entries(invite_code,network,reserved_amount_wei,status)
 VALUES('BRIDGE-GATE-RACE','mainnet',6000000000000000000,'AWAITING_CLAIM');
 IF NOT EXISTS(SELECT 1 FROM public.reward_queue_entries
 WHERE invite_code='BRIDGE-GATE-RACE' AND reserved_amount_wei=6000000000000000000)
 THEN RAISE EXCEPTION 'Converted handoff queue was incorrectly blocked'; END IF;
END $assert$;
ROLLBACK;
SELECT 'PASS: service-only read, disabled bridge, double-commit interlock and converted queue' result;
