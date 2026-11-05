-- Exact amount and external X/recovery/Sybil safety regression; disposable PG only.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 e numeric:=power(10::numeric,18);
 r jsonb;
 historical integer;
BEGIN
 -- Settings are mechanically disabled after migration.
 SELECT public.commit_reward_elastic_closed_cohort_v1(
  'ELASTIC-USER1','mainnet',2000*e,now(),1000,100*e,'{}'::jsonb) INTO r;
 IF r->>'mode'<>'LEGACY' THEN
   RAISE EXCEPTION 'Default disabled mode did not keep legacy payouts: %',r;
 END IF;
 UPDATE reward_admission_bridge.elastic_settlement_settings SET
   enabled=true,rollout_not_before=now()-interval '8 days' WHERE id=1;
 -- A single earlier valid participant means this round is not cleanly future-only.
 SELECT public.commit_reward_elastic_closed_cohort_v1(
  'ELASTIC-USER1','mainnet',2000*e,now(),1000,100*e,'{}'::jsonb) INTO r;
 IF r->>'reason'<>'MIXED_HISTORICAL_COHORT' THEN
   RAISE EXCEPTION 'Historical participant was silently repriced: %',r;
 END IF;
 UPDATE public.invitations SET status='CANCELLED',sybil_status='BLOCKED',
   reward_status='FORFEITED' WHERE invite_code='ELASTIC-OLDUSER';
 -- Incomplete/unreviewed participants are NEVER excluded from a final closure.
 SELECT public.commit_reward_elastic_closed_cohort_v1(
  'ELASTIC-USER1','mainnet',2000*e,now(),1000,100*e,'{}'::jsonb) INTO r;
 IF r->>'mode'<>'DEFER' OR r->>'reason'<>'UNRESOLVED_OR_EMPTY_RECIPIENT_SET' THEN
   RAISE EXCEPTION 'Unresolved user share was reallocated: %',r;
 END IF;
 UPDATE public.invitations SET status='CANCELLED',sybil_status='BLOCKED',
   reward_status='FORFEITED' WHERE invite_code='ELASTIC-UNFIN';
 -- Require an independently recorded completed round and a grace period.
 UPDATE public.vebetter_round_allocations SET observed_at=now()-interval '1 hour'
 WHERE vebetter_round_id=125;
 SELECT public.commit_reward_elastic_closed_cohort_v1(
  'ELASTIC-USER1','mainnet',2000*e,now(),1000,100*e,'{}'::jsonb) INTO r;
 IF r->>'reason'<>'WAIT_FOR_OFFICIAL_COHORT_CLOSE' THEN
   RAISE EXCEPTION 'Recent unfinished official round was settled: %',r;
 END IF;
 UPDATE public.vebetter_round_allocations SET observed_at=now()-interval '2 days'
 WHERE vebetter_round_id=125;
 -- Canonical committed amount must be calculated once under shared locks.
 SELECT public.commit_reward_elastic_closed_cohort_v1(
  'ELASTIC-USER1','mainnet',2000*e,now(),1000,100*e,'{}'::jsonb) INTO r;
 IF r->>'mode'<>'ELASTIC' OR r->>'reserved'<>'true'
   OR r->>'elasticGrossWei'<>(490*e)::text THEN
   RAISE EXCEPTION 'First eligible user did not receive funded boost: %',r;
 END IF;
 SELECT public.commit_reward_elastic_closed_cohort_v1(
  'ELASTIC-USER2','mainnet',2000*e,now(),1000,100*e,'{}'::jsonb) INTO r;
 IF r->>'mode'<>'ELASTIC' OR r->>'reserved'<>'true'
   OR r->>'elasticGrossWei'<>(490*e)::text THEN
   RAISE EXCEPTION 'Second user lost equal award or overspent: %',r;
 END IF;
 SELECT count(*) INTO historical FROM public.reward_queue_entries q
 WHERE q.invite_code IN ('ELASTIC-USER1','ELASTIC-USER2');
 IF historical<>2 THEN RAISE EXCEPTION 'Two verified winners not reserved'; END IF;
 IF public.read_reward_cohort_committed_wei(
    'mainnet','0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',125,1003
   )>1000*e THEN RAISE EXCEPTION 'Cohort budget exceeded'; END IF;
 -- Replay cannot create a second fixed/PAID record.
 SELECT public.commit_reward_elastic_closed_cohort_v1(
  'ELASTIC-USER1','mainnet',2000*e,now(),1000,100*e,'{}'::jsonb) INTO r;
 IF r->>'reason'<>'ALREADY_FIXED' THEN
   RAISE EXCEPTION 'Double reservation after canonical success: %',r;
 END IF;
 IF has_function_privilege('anon',
   'public.commit_reward_elastic_closed_cohort_v1(text,text,numeric,timestamptz,bigint,numeric,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated',
   'public.commit_reward_elastic_closed_cohort_v1(text,text,numeric,timestamptz,bigint,numeric,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Client could call privileged financial writer'; END IF;
END $test$;
ROLLBACK;
DO $post$
BEGIN
 IF (SELECT enabled FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1)
 THEN RAISE EXCEPTION 'Fake test enabled real elastic payout state'; END IF;
 IF EXISTS(SELECT 1 FROM public.reward_queue_entries WHERE invite_code='ELASTIC-USER1')
 THEN RAISE EXCEPTION 'Synthetic reward record leaked'; END IF;
END $post$;
SELECT 'PASS canonical once-only elastic closeout, X buffer, recovery, Sybil and old users' result;
