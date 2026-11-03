-- Verify compatibility with full pool + cohort budget, Claim, paid settlement.
\set ON_ERROR_STOP on
DO $q$
DECLARE s jsonb; c jsonb; r text; candidate text;
BEGIN
 SELECT reward_admission_lab.read_full_liability_snapshot() INTO s;
 IF (s->>'physicalWei')::numeric<>15*power(10::numeric,18)
   OR (s->>'admissionHeldWei')::numeric<>15*power(10::numeric,18)
   OR (s->>'fixedUnpaidWei')::numeric<>0
   OR (s->>'unallocatedPhysicalWei')::numeric<>0
   OR (s->>'poolUnderfunded')::boolean THEN
   RAISE EXCEPTION 'After PAID, the admitted minimums must remain fully held: %',s;
 END IF;

 SELECT reward_admission_lab.read_cohort_lifetime_plus_guarantees(124) INTO c;
 IF (c->>'lifetimeFixedWei')::numeric<>5*power(10::numeric,18)
   OR (c->>'unconvertedAdmissionWei')::numeric<>0
   OR (c->>'totalCohortEncumberedWei')::numeric<>5*power(10::numeric,18)
 THEN RAISE EXCEPTION 'Paid reward must keep its lifetime cohort commitment: %',c; END IF;

 SELECT reward_admission_lab.check_fixed_manifest_signable('FAKE-B',5*power(10::numeric,18)) INTO r;
 IF r<>'ALREADY_PAID' THEN RAISE EXCEPTION 'PAID replay was signable: %',r; END IF;

 SELECT code INTO candidate FROM reward_admission_lab.reservations
 WHERE code LIKE 'STRESS-%' AND status='HELD' ORDER BY code LIMIT 1;
 IF candidate IS NULL THEN RAISE EXCEPTION 'Missing held stress referral'; END IF;
 UPDATE reward_admission_lab.invites
 SET status='COMPLETED',mission_finalized=true,sybil_cleared=true WHERE code=candidate;
 SELECT reward_admission_lab.handoff_to_fixed(candidate,5*power(10::numeric,18)) INTO r;
 IF r<>'FIXED' THEN RAISE EXCEPTION 'Fixed handoff failed: %',r; END IF;

 SELECT reward_admission_lab.read_full_liability_snapshot() INTO s;
 IF (s->>'admissionHeldWei')::numeric<>10*power(10::numeric,18)
   OR (s->>'fixedUnpaidWei')::numeric<>5*power(10::numeric,18)
   OR (s->>'totalOutstandingWei')::numeric<>15*power(10::numeric,18)
   OR (s->>'unallocatedPhysicalWei')::numeric<>0
 THEN RAISE EXCEPTION 'Handoff double counted or lost liability: %',s; END IF;

 SELECT reward_admission_lab.read_cohort_lifetime_plus_guarantees(125) INTO c;
 IF (c->>'lifetimeFixedWei')::numeric<>5*power(10::numeric,18)
   OR (c->>'unconvertedAdmissionWei')::numeric<>5*power(10::numeric,18)
   OR (c->>'totalCohortEncumberedWei')::numeric<>10*power(10::numeric,18)
 THEN RAISE EXCEPTION 'Same cohort counted the floor twice or ignored it: %',c; END IF;

 SELECT reward_admission_lab.check_fixed_manifest_signable(candidate,5*power(10::numeric,18)) INTO r;
 IF r<>'SIGNABLE_SHADOW' THEN RAISE EXCEPTION 'Existing fixed reward would be starved: %',r; END IF;
 SELECT reward_admission_lab.check_fixed_manifest_signable(candidate,6*power(10::numeric,18)) INTO r;
 IF r<>'MANIFEST_MISMATCH' THEN RAISE EXCEPTION 'Uncommitted extra award signed: %',r; END IF;
 SELECT reward_admission_lab.check_fixed_manifest_signable('UNKNOWN',1) INTO r;
 IF r<>'NOT_FIXED' THEN RAISE EXCEPTION 'Unknown payout manifest allowed: %',r; END IF;
END $q$;

BEGIN;
DO $q$
DECLARE s jsonb; r text; candidate text;
BEGIN
 SELECT code INTO candidate FROM reward_admission_lab.fixed_rewards
 WHERE state='UNPAID' ORDER BY code LIMIT 1;
 -- Competing X-promotion/older liabilities consume physical capacity too.
 UPDATE reward_admission_lab.pool
 SET external_holds_wei=1*power(10::numeric,18) WHERE id=true;
 SELECT reward_admission_lab.read_full_liability_snapshot() INTO s;
 IF NOT (s->>'poolUnderfunded')::boolean THEN
   RAISE EXCEPTION 'External X/older liability did not expose pool deficit: %',s;
 END IF;
 SELECT reward_admission_lab.check_fixed_manifest_signable(candidate,5*power(10::numeric,18)) INTO r;
 IF r<>'LIABILITY_UNDERFUNDED' THEN
   RAISE EXCEPTION 'Manifest signed using reserved X/older reward: %',r;
 END IF;

 -- With truly additional external funding the SAME single fixed reward
 -- becomes signable; paid cohort history still remains committed.
 UPDATE reward_admission_lab.pool SET physical_wei=16*power(10::numeric,18) WHERE id=true;
 SELECT reward_admission_lab.check_fixed_manifest_signable(candidate,5*power(10::numeric,18)) INTO r;
 IF r<>'SIGNABLE_SHADOW' THEN RAISE EXCEPTION 'Fresh verified extra funds not recognized: %',r; END IF;
END $q$;
ROLLBACK;

BEGIN;
DO $q$
DECLARE s jsonb; candidate text; r text;
BEGIN
 SELECT code INTO candidate FROM reward_admission_lab.fixed_rewards
 WHERE state='UNPAID' ORDER BY code LIMIT 1;
 UPDATE reward_admission_lab.pool SET observed_at=now()-interval '20 minutes' WHERE id=true;
 SELECT reward_admission_lab.check_fixed_manifest_signable(candidate,5*power(10::numeric,18)) INTO r;
 IF r<>'STALE_POOL' THEN RAISE EXCEPTION 'Signed based on stale pool snapshot: %',r; END IF;
 UPDATE reward_admission_lab.pool SET observed_at=now(),unresolved_old_wei=1 WHERE id=true;
 SELECT reward_admission_lab.check_fixed_manifest_signable(candidate,5*power(10::numeric,18)) INTO r;
 IF r<>'LIABILITY_UNDERFUNDED' THEN RAISE EXCEPTION 'Unresolved legacy debt bypassed: %',r; END IF;
END $q$;
ROLLBACK;

DO $q$
BEGIN
 IF has_function_privilege('anon','reward_admission_lab.read_full_liability_snapshot()','EXECUTE')
    OR has_function_privilege('authenticated','reward_admission_lab.check_fixed_manifest_signable(text,numeric)','EXECUTE')
 THEN RAISE EXCEPTION 'Public exposure of financial liability bridge'; END IF;
END $q$;
SELECT 'PASS: cohort lifetime, physical holds, fixed liability, paid replay, X promotion underfunding, canonical quote' AS result;