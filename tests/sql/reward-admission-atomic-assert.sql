-- Isolated PostgreSQL 17 assertions, never Production.
\set ON_ERROR_STOP on
DO $q$
DECLARE
 held_count int;
 held_sum numeric(78,0);
 global_held numeric(78,0);
 result text;
BEGIN
 SELECT count(*),coalesce(sum(amount_wei),0) INTO held_count,held_sum
 FROM reward_admission_lab.reservations WHERE status='HELD';
 SELECT held_wei INTO global_held FROM reward_admission_lab.pool WHERE id=true;
 IF held_count<>1 OR global_held<>5*power(10::numeric,18) OR held_sum<>global_held THEN
   RAISE EXCEPTION 'Concurrency/wei conservation failure: %, %, %',held_count,held_sum,global_held;
 END IF;
 IF (SELECT count(*) FROM reward_admission_lab.cohorts WHERE held_wei>0)<>1 THEN
   RAISE EXCEPTION 'Funds were promised in two different cohorts';
 END IF;
 SELECT reward_admission_lab.reserve('FAKE-A') INTO result;
 IF result<>'ALREADY_RESERVED' THEN RAISE EXCEPTION 'Non-idempotent retry: %',result; END IF;
 SELECT reward_admission_lab.reserve('FAKE-B') INTO result;
 IF result<>'INSUFFICIENT' THEN RAISE EXCEPTION 'Cross-cohort double-spend: %',result; END IF;
END $q$;
BEGIN;
DO $q$
DECLARE result text;
BEGIN
 SELECT reward_admission_lab.release_terminal('FAKE-A') INTO result;
 IF result<>'NOT_TERMINAL' THEN RAISE EXCEPTION 'Premature release: %',result; END IF;
 UPDATE reward_admission_lab.invites SET status='SYBIL_BLOCKED' WHERE code='FAKE-A';
 SELECT reward_admission_lab.release_terminal('FAKE-A') INTO result;
 IF result<>'RELEASED' THEN RAISE EXCEPTION 'Terminal release failed: %',result; END IF;
 SELECT reward_admission_lab.release_terminal('FAKE-A') INTO result;
 IF result<>'ALREADY_RELEASED' THEN RAISE EXCEPTION 'Duplicate release: %',result; END IF;
 IF (SELECT held_wei FROM reward_admission_lab.pool WHERE id=true)<>0 THEN
   RAISE EXCEPTION 'After release global held funds are not zero';
 END IF;
 SELECT reward_admission_lab.reserve('FAKE-A') INTO result;
 IF result<>'TERMINAL' THEN RAISE EXCEPTION 'A released admission was re-opened: %',result; END IF;
END $q$;
ROLLBACK;
BEGIN;
DO $q$
DECLARE result text;
BEGIN
 UPDATE reward_admission_lab.pool SET observed_at=now()-interval '20 minutes';
 SELECT reward_admission_lab.reserve('FAKE-B') INTO result;
 IF result<>'STALE' THEN RAISE EXCEPTION 'Stale evidence accepted: %',result; END IF;
 UPDATE reward_admission_lab.pool SET observed_at=now(),unresolved_old_wei=1;
 SELECT reward_admission_lab.reserve('FAKE-B') INTO result;
 IF result<>'OLDER_LIABILITY' THEN RAISE EXCEPTION 'Legacy liability ignored: %',result; END IF;
 UPDATE reward_admission_lab.pool SET unresolved_old_wei=0;
 SELECT reward_admission_lab.reserve('FAKE-INELIGIBLE') INTO result;
 IF result<>'INVALID_INVITE' THEN RAISE EXCEPTION 'Ineligible invite accepted: %',result; END IF;
 UPDATE reward_admission_lab.pool SET physical_wei=10*power(10::numeric,18);
 SELECT reward_admission_lab.reserve('FAKE-B') INTO result;
 IF result<>'RESERVED' THEN RAISE EXCEPTION 'Safely funded other cohort rejected: %',result; END IF;
 IF (SELECT held_wei FROM reward_admission_lab.pool)<>10*power(10::numeric,18) THEN
   RAISE EXCEPTION 'Global holds did not include both cohorts';
 END IF;
END $q$;
ROLLBACK;
DO $q$
BEGIN
 IF has_schema_privilege('anon','reward_admission_lab','USAGE') THEN
   RAISE EXCEPTION 'anon can access private schema';
 END IF;
 IF has_schema_privilege('authenticated','reward_admission_lab','USAGE') THEN
   RAISE EXCEPTION 'authenticated can access private schema';
 END IF;
 IF has_function_privilege('anon','reward_admission_lab.reserve(text)','EXECUTE') THEN
   RAISE EXCEPTION 'anon can reserve';
 END IF;
 IF has_function_privilege('authenticated','reward_admission_lab.release_terminal(text)','EXECUTE') THEN
   RAISE EXCEPTION 'authenticated can release';
 END IF;
END $q$;
SELECT 'PASS: isolated transaction lock, idempotency, exact wei, old hold, eligible proof, terminality and public deny' AS result;