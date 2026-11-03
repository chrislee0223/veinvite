-- Isolated PostgreSQL 17 ONLY. Not a Supabase migration and never a live
-- admission writer. Proven fake attestation + exact gross/net recovery handoff.
-- Must run after admission payout and X-interop lab tests.
\set ON_ERROR_STOP on
CREATE TABLE reward_admission_lab.gross_net_attestations (
  code text PRIMARY KEY REFERENCES reward_admission_lab.invites(code),
  receipt_id bigint NOT NULL,
  gross_wei numeric(78,0) NOT NULL CHECK(gross_wei>0),
  offset_wei numeric(78,0) NOT NULL CHECK(offset_wei>=0 AND offset_wei<=gross_wei),
  authority_verified boolean NOT NULL DEFAULT false,
  issued_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reward_admission_lab.gross_net_settlements (
  code text PRIMARY KEY REFERENCES reward_admission_lab.invites(code),
  gross_wei numeric(78,0) NOT NULL,
  offset_wei numeric(78,0) NOT NULL,
  net_wei numeric(78,0) NOT NULL,
  kind text NOT NULL CHECK(kind IN ('NET_UNPAID','FULL_OFFSET')),
  CHECK(gross_wei=net_wei+offset_wei),
  CHECK(net_wei>=0),
  CHECK((kind='FULL_OFFSET')=(net_wei=0))
);
CREATE FUNCTION reward_admission_lab.handoff_verified_gross_net(p_code text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO pg_catalog,reward_admission_lab
AS $handoff$
DECLARE
  p reward_admission_lab.pool%rowtype;
  c reward_admission_lab.cohorts%rowtype;
  i reward_admission_lab.invites%rowtype;
  h reward_admission_lab.reservations%rowtype;
  att reward_admission_lab.gross_net_attestations%rowtype;
  v_cohort bigint;
  v_net numeric(78,0);
BEGIN
  -- Same globally serialized lock order as the ordinary admission writer:
  -- pool -> cohort -> invite -> hold -> recovery proof, with replay check.
  SELECT * INTO p FROM reward_admission_lab.pool WHERE id=true FOR UPDATE;
  IF NOT FOUND THEN RETURN 'MISSING_POOL'; END IF;
  SELECT cohort_id INTO v_cohort FROM reward_admission_lab.invites WHERE code=p_code;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  SELECT * INTO c FROM reward_admission_lab.cohorts WHERE id=v_cohort FOR UPDATE;
  SELECT * INTO i FROM reward_admission_lab.invites WHERE code=p_code FOR UPDATE;
  IF EXISTS(SELECT 1 FROM reward_admission_lab.gross_net_settlements WHERE code=p_code)
    THEN RETURN 'ALREADY_RECOVERY_SETTLED'; END IF;
  IF EXISTS(SELECT 1 FROM reward_admission_lab.fixed_rewards WHERE code=p_code)
    THEN RETURN 'ALREADY_FIXED'; END IF;
  SELECT * INTO h FROM reward_admission_lab.reservations WHERE code=p_code FOR UPDATE;
  IF NOT FOUND OR h.status<>'HELD' THEN RETURN 'NO_LIVE_GUARANTEE'; END IF;
  IF i.cohort_id<>h.cohort_id OR i.receipt_id<>c.receipt_id
     OR NOT i.verified THEN RETURN 'RECEIPT_MISMATCH'; END IF;
  IF i.status<>'COMPLETED' OR NOT i.mission_finalized OR NOT i.sybil_cleared
    THEN RETURN 'MISSION_OR_SYBIL_UNRESOLVED'; END IF;
  IF p.paused OR NOT p.evidence_verified OR NOT c.receipt_verified
    THEN RETURN 'FUNDING_UNVERIFIED'; END IF;
  IF p.observed_at>clock_timestamp()+interval '1 minute'
     OR clock_timestamp()-p.observed_at>interval '5 minutes'
    THEN RETURN 'STALE_POOL'; END IF;
  IF p.unresolved_old_wei<>0 THEN RETURN 'OLDER_STRESS_UNRESOLVED'; END IF;
  SELECT * INTO att FROM reward_admission_lab.gross_net_attestations
    WHERE code=p_code FOR UPDATE;
  IF NOT FOUND OR NOT att.authority_verified OR att.receipt_id<>i.receipt_id
    OR att.gross_wei<h.amount_wei
    OR ((att.offset_wei>0)<>i.recovery_offset_active)
    THEN RETURN 'RECOVERY_PROOF_UNVERIFIED'; END IF;
  v_net:=att.gross_wei-att.offset_wei;

  IF p.external_holds_wei+p.held_wei+p.unpaid_fixed_wei>p.physical_wei
     OR c.committed_wei+c.held_wei>c.budget_wei
     OR c.held_wei<h.amount_wei OR p.held_wei<h.amount_wei
    THEN RETURN 'BASELINE_INCONSISTENT'; END IF;
  -- One held gross guarantee is consumed; the physical ledger accepts ONLY
  -- the net B3TR transfer, but the lifetime cohort charges the GROSS quote.
  IF c.committed_wei+c.held_wei-h.amount_wei+att.gross_wei>c.budget_wei
     OR p.external_holds_wei+p.held_wei-h.amount_wei+
         p.unpaid_fixed_wei+v_net>p.physical_wei
    THEN RETURN 'HANDOFF_UNDERFUNDED'; END IF;

  UPDATE reward_admission_lab.pool
     SET held_wei=held_wei-h.amount_wei,
         unpaid_fixed_wei=unpaid_fixed_wei+v_net WHERE id=true;
  UPDATE reward_admission_lab.cohorts
     SET held_wei=held_wei-h.amount_wei,
         committed_wei=committed_wei+att.gross_wei WHERE id=c.id;
  UPDATE reward_admission_lab.reservations SET status='RELEASED' WHERE code=p_code;
  INSERT INTO reward_admission_lab.gross_net_settlements
    (code,gross_wei,offset_wei,net_wei,kind)
  VALUES (p_code,att.gross_wei,att.offset_wei,v_net,
          CASE WHEN v_net=0 THEN 'FULL_OFFSET' ELSE 'NET_UNPAID' END);
  IF v_net>0 THEN
    INSERT INTO reward_admission_lab.fixed_rewards(code,cohort_id,quote_wei,state)
      VALUES(p_code,c.id,v_net,'UNPAID');
    RETURN 'NET_FIXED';
  END IF;
  RETURN 'FULL_OFFSET_NO_TOKEN';
END $handoff$;
REVOKE ALL ON TABLE reward_admission_lab.gross_net_attestations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE reward_admission_lab.gross_net_settlements FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION reward_admission_lab.handoff_verified_gross_net(text) FROM PUBLIC,anon,authenticated;

-- In all cases below the fixture changes are rolled back. Absolutely no
-- actual source invite, financial wallet, X entry or Production SQL is touched.
BEGIN;
DO $qa$
DECLARE v_code text; outcome text; e numeric(78,0):=power(10::numeric,18);
BEGIN
  SELECT r.code INTO v_code FROM reward_admission_lab.reservations r
   WHERE r.code LIKE 'STRESS-%' AND r.status='HELD' ORDER BY r.code LIMIT 1;
  UPDATE reward_admission_lab.invites SET
    status='COMPLETED',mission_finalized=true,sybil_cleared=true,
    recovery_offset_active=true WHERE invites.code=v_code;
  INSERT INTO reward_admission_lab.gross_net_attestations
    (code,receipt_id,gross_wei,offset_wei,authority_verified)
  SELECT inv.code,inv.receipt_id,5*e,2*e,true FROM reward_admission_lab.invites inv WHERE inv.code=v_code;
  SELECT reward_admission_lab.handoff_verified_gross_net(v_code) INTO outcome;
  IF outcome<>'NET_FIXED' THEN RAISE EXCEPTION 'Partial gross/net failed: %',outcome; END IF;
  SELECT reward_admission_lab.handoff_verified_gross_net(v_code) INTO outcome;
  IF outcome<>'ALREADY_RECOVERY_SETTLED' THEN RAISE EXCEPTION 'Idempotency failed: %',outcome; END IF;
  IF (SELECT held_wei FROM reward_admission_lab.pool)<>5*e
     OR (SELECT unpaid_fixed_wei FROM reward_admission_lab.pool)<>8*e
     OR (SELECT committed_wei FROM reward_admission_lab.cohorts WHERE id=125)<>10*e
     OR (SELECT held_wei FROM reward_admission_lab.cohorts WHERE id=125)<>0
     OR (SELECT gross_wei FROM reward_admission_lab.gross_net_settlements WHERE gross_net_settlements.code=v_code)<>5*e
     OR (SELECT net_wei FROM reward_admission_lab.gross_net_settlements WHERE gross_net_settlements.code=v_code)<>3*e
     THEN RAISE EXCEPTION 'Gross lifetime and net physical ledgers diverged'; END IF;
  -- Existing verified PAID path consumes ONLY the actual net onchain amount.
  INSERT INTO reward_admission_lab.canonical_finalities
     (code,tx_id,quote_wei,chain_finalized,authority_verified)
   VALUES(v_code,'mock-gross-net-finality',3*e,true,true);
  SELECT reward_admission_lab.settle_finalized(v_code) INTO outcome;
  IF outcome<>'PAID'
     OR (SELECT physical_wei FROM reward_admission_lab.pool)<>12*e
     OR (SELECT held_wei FROM reward_admission_lab.pool)<>5*e
     OR (SELECT unpaid_fixed_wei FROM reward_admission_lab.pool)<>5*e
     OR (SELECT committed_wei FROM reward_admission_lab.cohorts WHERE id=125)<>10*e
     THEN RAISE EXCEPTION 'Net settlement ignored original GROSS lifetime charge'; END IF;
END $qa$;
ROLLBACK;

BEGIN;
DO $qa$
DECLARE v_code text; outcome text; e numeric(78,0):=power(10::numeric,18);
BEGIN
  SELECT r.code INTO v_code FROM reward_admission_lab.reservations r
   WHERE r.code LIKE 'STRESS-%' AND r.status='HELD' ORDER BY r.code LIMIT 1;
  UPDATE reward_admission_lab.invites SET
    status='COMPLETED',mission_finalized=true,sybil_cleared=true,
    recovery_offset_active=true WHERE invites.code=v_code;
  INSERT INTO reward_admission_lab.gross_net_attestations
    (code,receipt_id,gross_wei,offset_wei,authority_verified)
  SELECT inv.code,inv.receipt_id,5*e,5*e,true FROM reward_admission_lab.invites inv WHERE inv.code=v_code;
  SELECT reward_admission_lab.handoff_verified_gross_net(v_code) INTO outcome;
  IF outcome<>'FULL_OFFSET_NO_TOKEN' THEN RAISE EXCEPTION 'Full offset failed: %',outcome; END IF;
  IF EXISTS(SELECT 1 FROM reward_admission_lab.fixed_rewards f WHERE f.code=v_code)
    OR (SELECT held_wei FROM reward_admission_lab.pool)<>5*e
    OR (SELECT unpaid_fixed_wei FROM reward_admission_lab.pool)<>5*e
    OR (SELECT committed_wei FROM reward_admission_lab.cohorts WHERE id=125)<>10*e
    THEN RAISE EXCEPTION 'Full offset created fake token debt or failed lifetime gross'; END IF;
END $qa$;
ROLLBACK;

BEGIN;
DO $qa$
DECLARE v_code text; outcome text; e numeric(78,0):=power(10::numeric,18);
BEGIN
  SELECT r.code INTO v_code FROM reward_admission_lab.reservations r
   WHERE r.code LIKE 'STRESS-%' AND r.status='HELD' ORDER BY r.code LIMIT 1;
  UPDATE reward_admission_lab.invites SET
    status='COMPLETED',mission_finalized=true,sybil_cleared=true,
    recovery_offset_active=false WHERE invites.code=v_code;
  INSERT INTO reward_admission_lab.gross_net_attestations
    (code,receipt_id,gross_wei,offset_wei,authority_verified)
  SELECT inv.code,inv.receipt_id,7*e,0,true FROM reward_admission_lab.invites inv WHERE inv.code=v_code;
  SELECT reward_admission_lab.handoff_verified_gross_net(v_code) INTO outcome;
  IF outcome<>'HANDOFF_UNDERFUNDED' THEN RAISE EXCEPTION 'Unfunded extra gross accepted: %',outcome; END IF;
  IF (SELECT status FROM reward_admission_lab.reservations WHERE reservations.code=v_code)<>'HELD' THEN
    RAISE EXCEPTION 'Failed quote stole old guarantee'; END IF;
  -- Both cohort funds and actually verified physical tokens must increase.
  UPDATE reward_admission_lab.pool SET physical_wei=physical_wei+2*e WHERE id=true;
  UPDATE reward_admission_lab.cohorts SET budget_wei=budget_wei+2*e WHERE id=125;
  SELECT reward_admission_lab.handoff_verified_gross_net(v_code) INTO outcome;
  IF outcome<>'NET_FIXED' THEN RAISE EXCEPTION 'Genuinely funded increase rejected: %',outcome; END IF;
  IF (SELECT unpaid_fixed_wei FROM reward_admission_lab.pool)<>12*e
    OR (SELECT committed_wei FROM reward_admission_lab.cohorts WHERE id=125)<>12*e
  THEN RAISE EXCEPTION 'Funded gross and net flow wrong'; END IF;
END $qa$;
ROLLBACK;

BEGIN;
DO $qa$
DECLARE v_code text; outcome text; e numeric(78,0):=power(10::numeric,18);
BEGIN
  SELECT r.code INTO v_code FROM reward_admission_lab.reservations r
   WHERE r.code LIKE 'STRESS-%' AND r.status='HELD' ORDER BY r.code LIMIT 1;
  UPDATE reward_admission_lab.invites SET
    status='COMPLETED',mission_finalized=true,sybil_cleared=false,
    recovery_offset_active=true WHERE invites.code=v_code;
  INSERT INTO reward_admission_lab.gross_net_attestations
    (code,receipt_id,gross_wei,offset_wei,authority_verified)
  SELECT inv.code,inv.receipt_id,5*e,2*e,false FROM reward_admission_lab.invites inv WHERE inv.code=v_code;
  SELECT reward_admission_lab.handoff_verified_gross_net(v_code) INTO outcome;
  IF outcome<>'MISSION_OR_SYBIL_UNRESOLVED' THEN RAISE EXCEPTION 'Sybil bypass: %',outcome; END IF;
  UPDATE reward_admission_lab.invites SET sybil_cleared=true WHERE invites.code=v_code;
  SELECT reward_admission_lab.handoff_verified_gross_net(v_code) INTO outcome;
  IF outcome<>'RECOVERY_PROOF_UNVERIFIED' THEN RAISE EXCEPTION 'Unverified offset bypass: %',outcome; END IF;
  UPDATE reward_admission_lab.gross_net_attestations SET authority_verified=true,receipt_id=999999
    WHERE gross_net_attestations.code=v_code;
  SELECT reward_admission_lab.handoff_verified_gross_net(v_code) INTO outcome;
  IF outcome<>'RECOVERY_PROOF_UNVERIFIED' THEN RAISE EXCEPTION 'Wrong funding receipt bypass: %',outcome; END IF;
  UPDATE reward_admission_lab.gross_net_attestations SET receipt_id=125 WHERE gross_net_attestations.code=v_code;
  -- The prior cohort id is NOT the receipt: a mistaken reuse must be refused.
  SELECT reward_admission_lab.handoff_verified_gross_net(v_code) INTO outcome;
  IF outcome<>'RECOVERY_PROOF_UNVERIFIED' THEN RAISE EXCEPTION 'Cohort id mistaken for receipt id: %',outcome; END IF;
  IF (SELECT status FROM reward_admission_lab.reservations WHERE reservations.code=v_code)<>'HELD'
     OR EXISTS(SELECT 1 FROM reward_admission_lab.gross_net_settlements s WHERE s.code=v_code)
     THEN RAISE EXCEPTION 'Invalid attestation mutated an admission hold'; END IF;
END $qa$;
ROLLBACK;
-- A simultaneous LIVE X claim uses the same physical pool. Neither a
-- gross recovery offset nor an old held minimum can silently fund X.
BEGIN;
DO $qa$
DECLARE v_code text; outcome text; e numeric(78,0):=power(10::numeric,18);
BEGIN
  SELECT r.code INTO v_code FROM reward_admission_lab.reservations r
    WHERE r.code LIKE 'STRESS-%' AND r.status='HELD' ORDER BY r.code LIMIT 1;
  UPDATE reward_admission_lab.invites SET
    status='COMPLETED',mission_finalized=true,sybil_cleared=true,
    recovery_offset_active=true WHERE invites.code=v_code;
  INSERT INTO reward_admission_lab.gross_net_attestations
    (code,receipt_id,gross_wei,offset_wei,authority_verified)
  SELECT inv.code,inv.receipt_id,5*e,2*e,true
    FROM reward_admission_lab.invites inv WHERE inv.code=v_code;
  UPDATE reward_admission_lab.pool SET external_holds_wei=e WHERE id=true;
  SELECT reward_admission_lab.handoff_verified_gross_net(v_code) INTO outcome;
  IF outcome<>'BASELINE_INCONSISTENT'
     OR (SELECT status FROM reward_admission_lab.reservations WHERE code=v_code)<>'HELD'
  THEN RAISE EXCEPTION 'Unfunded concurrent LIVE X consumed original guaranteed floor: %',outcome; END IF;
  UPDATE reward_admission_lab.pool SET physical_wei=physical_wei+e WHERE id=true;
  SELECT reward_admission_lab.handoff_verified_gross_net(v_code) INTO outcome;
  IF outcome<>'NET_FIXED' THEN RAISE EXCEPTION 'X correctly funded but gross/net handoff failed: %',outcome; END IF;
  IF (SELECT physical_wei FROM reward_admission_lab.pool)<>16*e
     OR (SELECT held_wei+unpaid_fixed_wei+external_holds_wei FROM reward_admission_lab.pool)<>14*e
     OR (SELECT committed_wei FROM reward_admission_lab.cohorts WHERE id=125)<>10*e
  THEN RAISE EXCEPTION 'X and recovered base reward were counted twice'; END IF;
END $qa$;
ROLLBACK;

DO $qa$
BEGIN
 IF has_function_privilege('anon','reward_admission_lab.handoff_verified_gross_net(text)','EXECUTE')
   OR has_function_privilege('authenticated','reward_admission_lab.handoff_verified_gross_net(text)','EXECUTE')
   OR has_table_privilege('anon','reward_admission_lab.gross_net_attestations','SELECT')
   THEN RAISE EXCEPTION 'Public actor can spoof recovery funding proof'; END IF;
END $qa$;
SELECT 'PASS: isolated gross/net recovery attestation, held-to-fixed, verified PAID and full offset' AS result;
