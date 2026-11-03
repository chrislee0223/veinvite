-- Isolated PostgreSQL 17: admission holds must be handed off exactly once.
\set ON_ERROR_STOP on
DO $q$
DECLARE result text;
BEGIN
 UPDATE reward_admission_lab.invites
 SET status='COMPLETED',mission_finalized=true,sybil_cleared=false
 WHERE code='FAKE-B';
 SELECT reward_admission_lab.handoff_to_fixed('FAKE-B',5*power(10::numeric,18)) INTO result;
 IF result<>'NOT_FINALIZED_CLEAR' THEN RAISE EXCEPTION 'Sybil not clear still handed off: %',result; END IF;

 UPDATE reward_admission_lab.invites SET sybil_cleared=true,recovery_offset_active=true WHERE code='FAKE-B';
 SELECT reward_admission_lab.handoff_to_fixed('FAKE-B',5*power(10::numeric,18)) INTO result;
 IF result<>'RECOVERY_OFFSET_REQUIRES_GROSS_NET_RECONCILIATION' THEN
   RAISE EXCEPTION 'Recovery offset was bypassed: %',result;
 END IF;
 IF (SELECT status FROM reward_admission_lab.reservations WHERE code='FAKE-B')<>'HELD' THEN
   RAISE EXCEPTION 'Refused recovery offset nevertheless released guarantee';
 END IF;
 UPDATE reward_admission_lab.invites SET recovery_offset_active=false WHERE code='FAKE-B';
 SELECT reward_admission_lab.handoff_to_fixed('FAKE-B',5*power(10::numeric,18)) INTO result;
 IF result<>'FIXED' THEN RAISE EXCEPTION 'Valid fixed handoff failed: %',result; END IF;
 SELECT reward_admission_lab.handoff_to_fixed('FAKE-B',5*power(10::numeric,18)) INTO result;
 IF result<>'ALREADY_FIXED' THEN RAISE EXCEPTION 'Duplicate handoff: %',result; END IF;

 IF (SELECT held_wei FROM reward_admission_lab.pool)<>15*power(10::numeric,18)
   OR (SELECT unpaid_fixed_wei FROM reward_admission_lab.pool)<>5*power(10::numeric,18)
   OR (SELECT committed_wei FROM reward_admission_lab.cohorts WHERE id=124)<>5*power(10::numeric,18)
   OR (SELECT held_wei FROM reward_admission_lab.cohorts WHERE id=124)<>0
 THEN RAISE EXCEPTION 'Guarantee not exchanged 1:1 for fixed liability'; END IF;

 SELECT reward_admission_lab.release_terminal('FAKE-B') INTO result;
 IF result<>'ALREADY_RELEASED' THEN RAISE EXCEPTION 'Original hold resurrected: %',result; END IF;
 SELECT reward_admission_lab.settle_finalized('FAKE-B') INTO result;
 IF result<>'WAITING_CANONICAL_FINALITY' THEN RAISE EXCEPTION 'Premature PAID: %',result; END IF;
END $q$;

INSERT INTO reward_admission_lab.canonical_finalities
  (code,tx_id,quote_wei,chain_finalized,authority_verified)
VALUES ('FAKE-B','mock-immutable-chain-tx-1',4*power(10::numeric,18),false,false);
DO $q$
DECLARE result text;
BEGIN
 SELECT reward_admission_lab.settle_finalized('FAKE-B') INTO result;
 IF result<>'WAITING_CANONICAL_FINALITY' THEN RAISE EXCEPTION 'Unfinalized chain proof used'; END IF;
 UPDATE reward_admission_lab.canonical_finalities SET chain_finalized=true,authority_verified=true WHERE code='FAKE-B';
 SELECT reward_admission_lab.settle_finalized('FAKE-B') INTO result;
 IF result<>'WAITING_CANONICAL_FINALITY' THEN RAISE EXCEPTION 'Wrong token amount paid'; END IF;
 UPDATE reward_admission_lab.canonical_finalities SET quote_wei=5*power(10::numeric,18) WHERE code='FAKE-B';
 SELECT reward_admission_lab.settle_finalized('FAKE-B') INTO result;
 IF result<>'PAID' THEN RAISE EXCEPTION 'Verified finality not settled: %',result; END IF;
 SELECT reward_admission_lab.settle_finalized('FAKE-B') INTO result;
 IF result<>'ALREADY_PAID' THEN RAISE EXCEPTION 'Duplicate confirmed payment: %',result; END IF;
 IF (SELECT physical_wei FROM reward_admission_lab.pool)<>15*power(10::numeric,18)
 OR (SELECT unpaid_fixed_wei FROM reward_admission_lab.pool)<>0
 OR (SELECT held_wei FROM reward_admission_lab.pool)<>15*power(10::numeric,18)
 OR (SELECT committed_wei FROM reward_admission_lab.cohorts WHERE id=124)<>5*power(10::numeric,18)
 THEN RAISE EXCEPTION 'Settlement counters do not conserve lifetime commitments'; END IF;
END $q$;

BEGIN;
DO $q$
DECLARE invite text; result text;
BEGIN
 SELECT code INTO invite FROM reward_admission_lab.reservations
 WHERE code LIKE 'STRESS-%' AND status='HELD' ORDER BY code LIMIT 1;
 IF invite IS NULL THEN RAISE EXCEPTION 'Stress participant reservation missing'; END IF;
 UPDATE reward_admission_lab.invites
 SET status='COMPLETED',mission_finalized=true,sybil_cleared=true WHERE code=invite;
 -- Quote above available cohort headroom must fail with the old hold intact.
 SELECT reward_admission_lab.handoff_to_fixed(invite,6*power(10::numeric,18)) INTO result;
 IF result<>'QUOTE_UNDERFUNDED' THEN RAISE EXCEPTION 'Over-quoted payout used reserved funds: %',result; END IF;
 IF (SELECT status FROM reward_admission_lab.reservations WHERE code=invite)<>'HELD' THEN
   RAISE EXCEPTION 'Failed payout quote released guaranteed minimum';
 END IF;
 SELECT reward_admission_lab.handoff_to_fixed(invite,5*power(10::numeric,18)) INTO result;
 IF result<>'FIXED' THEN RAISE EXCEPTION 'Exact floor payout failed: %',result; END IF;
END $q$;
ROLLBACK;

BEGIN;
DO $q$
DECLARE invite text; result text;
BEGIN
 SELECT code INTO invite FROM reward_admission_lab.reservations
 WHERE code LIKE 'STRESS-%' AND status='HELD' ORDER BY code LIMIT 1;
 UPDATE reward_admission_lab.invites
 SET status='COMPLETED',mission_finalized=true,sybil_cleared=true WHERE code=invite;
 UPDATE reward_admission_lab.pool SET external_holds_wei=1;
 SELECT reward_admission_lab.handoff_to_fixed(invite,5*power(10::numeric,18)) INTO result;
 IF result<>'INCONSISTENT' THEN RAISE EXCEPTION 'Unreconciled pool double-committed: %',result; END IF;
END $q$;
ROLLBACK;

DO $q$
BEGIN
 IF has_function_privilege('anon','reward_admission_lab.handoff_to_fixed(text,numeric)','EXECUTE') OR
    has_function_privilege('authenticated','reward_admission_lab.settle_finalized(text)','EXECUTE') THEN
   RAISE EXCEPTION 'Public users can transfer/settle a guarantee';
 END IF;
END $q$;
SELECT 'PASS: held-floor to fixed liability to verified on-chain PAID; no double counting or early release' result;