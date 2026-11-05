-- Disposable PG17 read-only monitor: waits for genuine official close,
-- sees stalled eligibles, and does not write a Claim or change Sybil status.
\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
 r jsonb;
BEGIN
 SELECT public.read_reward_elastic_closure_liveness_v1(
  'mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e') INTO r;
 IF r->>'enabled'<>'false' OR r->>'criticalUnreserved'<>'0' THEN
  RAISE EXCEPTION 'Disabled alarm raised a false signal: %',r;
 END IF;
 UPDATE reward_admission_bridge.elastic_settlement_settings SET
  enabled=true,rollout_not_before=now()-interval '8 days' WHERE id=1;
 UPDATE public.invitations SET status='CANCELLED',sybil_status='BLOCKED',
   reward_status='FORFEITED' WHERE invite_code='ELASTIC-OLDUSER';
 SELECT public.read_reward_elastic_closure_liveness_v1(
  'mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e') INTO r;
 IF r->>'enabled'<>'true' OR r->>'criticalUnreserved'<>'2'
   OR r->>'readyUnreserved'<>'2' OR r->>'unfinishedInClosedCohorts'<>'1'
 THEN RAISE EXCEPTION 'Closed cohort monitor missed overdue winner / unfinished slot: %',r;
 END IF;
 UPDATE public.vebetter_round_allocations SET observed_at=now()-interval '1 hour'
  WHERE vebetter_round_id=125;
 SELECT public.read_reward_elastic_closure_liveness_v1(
  'mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e') INTO r;
 IF r->>'criticalUnreserved'<>'0' OR r->>'readyUnreserved'<>'0'
 THEN RAISE EXCEPTION 'Not-yet-closed cohort was marked late: %',r;
 END IF;
 IF has_function_privilege('anon',
    'public.read_reward_elastic_closure_liveness_v1(text,text)','EXECUTE')
   OR has_function_privilege('authenticated',
    'public.read_reward_elastic_closure_liveness_v1(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Operator liveness leaked to browser'; END IF;
END $verify$;
ROLLBACK;
SELECT 'PASS elastic closure liveness stops false alarms before close' result;
