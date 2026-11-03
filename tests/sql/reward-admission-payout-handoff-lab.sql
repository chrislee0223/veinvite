-- Isolated PostgreSQL 17 model of the legacy reservation->Claim->PAID handoff.
-- Never apply to Production. This is NOT a Supabase migration.
\set ON_ERROR_STOP on
ALTER TABLE reward_admission_lab.pool
  ADD COLUMN unpaid_fixed_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK(unpaid_fixed_wei>=0);
ALTER TABLE reward_admission_lab.invites
  ADD COLUMN mission_finalized boolean NOT NULL DEFAULT false,
  ADD COLUMN sybil_cleared boolean NOT NULL DEFAULT false,
  ADD COLUMN recovery_offset_active boolean NOT NULL DEFAULT false;
CREATE TABLE reward_admission_lab.fixed_rewards (
  code text PRIMARY KEY REFERENCES reward_admission_lab.invites(code),
  cohort_id bigint NOT NULL REFERENCES reward_admission_lab.cohorts(id),
  quote_wei numeric(78,0) NOT NULL CHECK(quote_wei>0),
  state text NOT NULL CHECK(state IN ('UNPAID','PAID')),
  fixed_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE TABLE reward_admission_lab.canonical_finalities (
  code text PRIMARY KEY REFERENCES reward_admission_lab.fixed_rewards(code),
  tx_id text UNIQUE NOT NULL CHECK(length(tx_id)>0),
  quote_wei numeric(78,0) NOT NULL CHECK(quote_wei>0),
  chain_finalized boolean NOT NULL,
  authority_verified boolean NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);

-- Live analogue is commit_reward_reservation_with_late_reserve RPC:
-- The live code currently DOES NOT consult any admission hold ledger.
-- In a future version, transition the admitted floor into the immutable
-- completion-time fixed reward in one locked transaction; never count both.
CREATE FUNCTION reward_admission_lab.handoff_to_fixed(p_code text,p_quote_wei numeric)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO pg_catalog,reward_admission_lab
AS $fn$
DECLARE
 p reward_admission_lab.pool%rowtype;
 c reward_admission_lab.cohorts%rowtype;
 i reward_admission_lab.invites%rowtype;
 r reward_admission_lab.reservations%rowtype;
 f reward_admission_lab.fixed_rewards%rowtype;
 cohort bigint;
BEGIN
 -- Same lock order as reserve/release: pool -> cohort -> invitation -> hold.
 SELECT * INTO p FROM reward_admission_lab.pool WHERE id=true FOR UPDATE;
 IF NOT FOUND THEN RETURN 'MISSING_POOL'; END IF;
 SELECT cohort_id INTO cohort FROM reward_admission_lab.invites WHERE code=p_code;
 IF NOT FOUND THEN RETURN 'INVALID_INVITE'; END IF;
 SELECT * INTO c FROM reward_admission_lab.cohorts WHERE id=cohort FOR UPDATE;
 SELECT * INTO i FROM reward_admission_lab.invites WHERE code=p_code FOR UPDATE;
 SELECT * INTO r FROM reward_admission_lab.reservations WHERE code=p_code FOR UPDATE;
 SELECT * INTO f FROM reward_admission_lab.fixed_rewards WHERE code=p_code FOR UPDATE;
 IF FOUND THEN
   RETURN CASE WHEN f.state='PAID' THEN 'ALREADY_PAID' ELSE 'ALREADY_FIXED' END;
 END IF;
 IF NOT FOUND AND r.code IS NULL THEN RETURN 'NO_GUARANTEE'; END IF;
 IF r.status<>'HELD' THEN RETURN 'NOT_HELD'; END IF;
 IF i.cohort_id<>r.cohort_id OR i.receipt_id<>c.receipt_id THEN RETURN 'RECEIPT_MISMATCH'; END IF;
 IF i.status<>'COMPLETED' OR NOT i.verified OR
    NOT i.mission_finalized OR NOT i.sybil_cleared THEN RETURN 'NOT_FINALIZED_CLEAR'; END IF;
 -- Legacy recovery may split the gross quote into net B3TR and offset ledger.
 -- Fail closed until that two-ledger bridge is implemented and reconciled.
 IF i.recovery_offset_active THEN RETURN 'RECOVERY_OFFSET_REQUIRES_GROSS_NET_RECONCILIATION'; END IF;
 IF p.paused OR NOT p.evidence_verified OR NOT c.receipt_verified THEN RETURN 'UNVERIFIED'; END IF;
 IF p.observed_at>clock_timestamp()+interval '1 minute' OR
    clock_timestamp()-p.observed_at>interval '5 minutes' THEN RETURN 'STALE'; END IF;
 IF p.unresolved_old_wei>0 THEN RETURN 'OLDER_LIABILITY'; END IF;
 IF p_quote_wei IS NULL OR p_quote_wei<r.amount_wei THEN RETURN 'BELOW_GUARANTEE'; END IF;
 IF p.external_holds_wei+p.held_wei+p.unpaid_fixed_wei>p.physical_wei
   OR c.committed_wei+c.held_wei>c.budget_wei THEN RETURN 'INCONSISTENT'; END IF;
 -- The same floor was already held; release it only if the larger fixed
 -- quote is fully affordable after substituting, not before.
 IF c.committed_wei+c.held_wei-r.amount_wei+p_quote_wei>c.budget_wei OR
    p.external_holds_wei+p.held_wei-r.amount_wei+
      p.unpaid_fixed_wei+p_quote_wei>p.physical_wei THEN RETURN 'QUOTE_UNDERFUNDED'; END IF;
 UPDATE reward_admission_lab.pool
   SET held_wei=held_wei-r.amount_wei,
       unpaid_fixed_wei=unpaid_fixed_wei+p_quote_wei WHERE id=true;
 UPDATE reward_admission_lab.cohorts
   SET held_wei=held_wei-r.amount_wei,
       committed_wei=committed_wei+p_quote_wei WHERE id=c.id;
 UPDATE reward_admission_lab.reservations SET status='RELEASED' WHERE code=p_code;
 INSERT INTO reward_admission_lab.fixed_rewards(code,cohort_id,quote_wei,state)
   VALUES(p_code,c.id,p_quote_wei,'UNPAID');
 RETURN 'FIXED';
END $fn$;

-- Canonical finality is a separate, trusted evidence record.
-- In Production this MUST be verified against VeChain tx + manifest.
-- The lab's physical counter merely simulates a settled on-chain transfer.
CREATE FUNCTION reward_admission_lab.settle_finalized(p_code text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO pg_catalog,reward_admission_lab
AS $fn$
DECLARE
 p reward_admission_lab.pool%rowtype;
 c reward_admission_lab.cohorts%rowtype;
 i reward_admission_lab.invites%rowtype;
 f reward_admission_lab.fixed_rewards%rowtype;
 e reward_admission_lab.canonical_finalities%rowtype;
 cohort bigint;
BEGIN
 SELECT * INTO p FROM reward_admission_lab.pool WHERE id=true FOR UPDATE;
 SELECT cohort_id INTO cohort FROM reward_admission_lab.invites WHERE code=p_code;
 IF NOT FOUND THEN RETURN 'INVALID_INVITE'; END IF;
 SELECT * INTO c FROM reward_admission_lab.cohorts WHERE id=cohort FOR UPDATE;
 SELECT * INTO i FROM reward_admission_lab.invites WHERE code=p_code FOR UPDATE;
 SELECT * INTO f FROM reward_admission_lab.fixed_rewards WHERE code=p_code FOR UPDATE;
 IF NOT FOUND THEN RETURN 'NOT_FIXED'; END IF;
 IF f.state='PAID' THEN RETURN 'ALREADY_PAID'; END IF;
 SELECT * INTO e FROM reward_admission_lab.canonical_finalities WHERE code=p_code FOR UPDATE;
 IF NOT FOUND OR NOT e.chain_finalized OR NOT e.authority_verified
   OR e.quote_wei<>f.quote_wei THEN RETURN 'WAITING_CANONICAL_FINALITY'; END IF;
 IF p.unpaid_fixed_wei<f.quote_wei OR p.physical_wei<f.quote_wei THEN RETURN 'INCONSISTENT'; END IF;
 UPDATE reward_admission_lab.pool SET
   unpaid_fixed_wei=unpaid_fixed_wei-f.quote_wei,
   physical_wei=physical_wei-f.quote_wei WHERE id=true;
 -- Lifetime cohort commitment remains committed after PAID.
 UPDATE reward_admission_lab.fixed_rewards SET state='PAID',paid_at=now() WHERE code=p_code;
 UPDATE reward_admission_lab.invites SET status='PAID' WHERE code=p_code;
 RETURN 'PAID';
END $fn$;

REVOKE ALL ON ALL TABLES IN SCHEMA reward_admission_lab FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION reward_admission_lab.handoff_to_fixed(text,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION reward_admission_lab.settle_finalized(text) FROM PUBLIC,anon,authenticated;