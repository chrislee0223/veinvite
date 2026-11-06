-- At exact physical capacity, base and X signers cannot spend the
-- cohort's protected money, but its OWN verified elastic Claim CAN convert
-- its already protected allocation into a canonical queue in the same tx.
-- Old, new, blocked, replay, and underfunded cases remain fail-closed.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 e numeric:=power(10::numeric,18);
 physical numeric;
 after_reserve numeric;
 r jsonb;
 blocked boolean:=false;
 basis jsonb:='{"elasticClosure":{"policy":"elastic-closed-cohort-v1"}}';
BEGIN
 UPDATE reward_admission_bridge.elastic_settlement_settings SET
   enabled=true,allow_protected_partial_settlement=true,
   rollout_not_before=now()-interval '8 days' WHERE id=1;
 UPDATE public.invitations SET status='CANCELLED',sybil_status='BLOCKED',
   reward_status='FORFEITED' WHERE invite_code='ELASTIC-OLDUSER';
 SELECT public.read_outstanding_reward_liability('mainnet',app)::numeric
 INTO physical;
 IF physical<1000*e THEN
  RAISE EXCEPTION 'Test cohort not fully protected before payout'; END IF;

 -- Other algorithms, even for a legitimate completed user, may NOT borrow
 -- the cohort's already promised money.
 SELECT public.commit_reward_reservation(
 'ELASTIC-USER2','mainnet',physical,physical,300*e,
 'legacy-forecast',null,1000,'{}') INTO r;
 IF r->>'reserved'<>'false' OR r->>'reason'<>'RECALCULATE' THEN
   RAISE EXCEPTION 'A non-elastic payout spent a future cohort escrow: %',r;
 END IF;

 -- An invented future algorithm name without the real closure proof cannot
 -- unlock escrow using the service role.
 blocked:=false;
 BEGIN
  PERFORM public.commit_reward_reservation(
    'ELASTIC-USER2','mainnet',physical,physical,300*e,
    'elastic-closed-cohort-v1',null,1000,'{}');
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='ELASTIC_CANONICAL_SELF_ESCROW_AUTHORITY_MISSING' THEN
    blocked:=true;
  END IF;
 END;
 IF NOT blocked THEN
  RAISE EXCEPTION 'Canonical writer accepted forged elastic closure metadata';
 END IF;

 -- Even a correct future winner cannot reserve against an underfunded
 -- physical pool (pool < total outstanding before transfer).
 SELECT public.commit_reward_reservation(
 'ELASTIC-USER2','mainnet',physical-1,physical,300*e,
 'elastic-closed-cohort-v1',null,1000,basis) INTO r;
 IF r->>'reason'<>'RECALCULATE' THEN
  RAISE EXCEPTION 'Insolvent pool paid an elastic reward: %',r;
 END IF;

 -- A fully verified future winner can move EXISTING 300 out of its own
 -- reserved 1000, even when pool == outstanding and free wallet cash == 0.
 SELECT public.commit_reward_reservation(
 'ELASTIC-USER1','mainnet',physical,physical,300*e,
 'elastic-closed-cohort-v1',null,1000,basis) INTO r;
 IF r->>'reserved'<>'true' OR r->>'amountWei'<>
   (300*e)::text THEN
  RAISE EXCEPTION 'A funded elastic winner incorrectly got NO_AVAILABLE: %',r;
 END IF;
 SELECT public.read_outstanding_reward_liability('mainnet',app)::numeric
 INTO after_reserve;
 IF after_reserve<>physical THEN
  RAISE EXCEPTION 'Escrow conversion inflated or released physical liabilities';
 END IF;

 -- Replaying the same reward can never create a second Claim.
 SELECT public.commit_reward_reservation(
 'ELASTIC-USER1','mainnet',physical,physical,300*e,
 'elastic-closed-cohort-v1',null,1000,basis) INTO r;
 IF r->>'reason'<>'ALREADY_FIXED' THEN
  RAISE EXCEPTION 'One winner reserved a second time: %',r; END IF;

 -- Another clear winner can convert its own portion without eating the
 -- 400+ left for X and unfinished future referral.
 SELECT public.commit_reward_reservation(
 'ELASTIC-USER2','mainnet',physical,physical,300*e,
 'elastic-closed-cohort-v1',null,1000,basis) INTO r;
 IF r->>'reserved'<>'true' THEN
  RAISE EXCEPTION 'Second valid user blocked by first user's escrow: %',r;
 END IF;
 IF public.read_outstanding_reward_liability('mainnet',app)::numeric<>
    physical THEN RAISE EXCEPTION 'Second reserve corrupted total liabilities'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS true pool exhaustion honors future cohort self-escrow, protects others and replay' result;
