-- VeInvite multilevel PRIVATE preview-only safety guard overlay (2026-11-19).
-- Must apply AFTER 20261119_multilevel_private_ledger_preview_v1.sql.
-- Project bpppslplhmppxzvdkwxs ONLY. No production writes or payouts.
BEGIN;
ALTER TABLE veinvite_multilevel_staging.claim_legs
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE veinvite_multilevel_staging.x_share_proofs
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE veinvite_multilevel_staging.round_books
  DROP CONSTRAINT IF EXISTS round_not_final_without_fingerprint;
ALTER TABLE veinvite_multilevel_staging.round_books
  ADD CONSTRAINT round_not_final_without_fingerprint
  CHECK (lifecycle='DRAFT' OR input_fingerprint IS NOT NULL);

-- This is an isolated draft: once a verified proof or entitlement is recorded,
-- editing/deleting it must not rewrite reward history.
CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.forbid_money_history_mutation_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'MULTILEVEL_IMMUTABLE_FINANCIAL_HISTORY';
END;
$$;
CREATE TRIGGER multilevel_events_no_mutate
  BEFORE UPDATE OR DELETE ON veinvite_multilevel_staging.verified_events
  FOR EACH ROW EXECUTE FUNCTION veinvite_multilevel_staging.forbid_money_history_mutation_v1();
CREATE TRIGGER multilevel_entitlements_no_mutate
  BEFORE UPDATE OR DELETE ON veinvite_multilevel_staging.entitlements
  FOR EACH ROW EXECUTE FUNCTION veinvite_multilevel_staging.forbid_money_history_mutation_v1();
CREATE TRIGGER multilevel_returns_no_mutate
  BEFORE UPDATE OR DELETE ON veinvite_multilevel_staging.return_ledger
  FOR EACH ROW EXECUTE FUNCTION veinvite_multilevel_staging.forbid_money_history_mutation_v1();

CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.guard_round_book_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.lifecycle='SEALED' THEN
    RAISE EXCEPTION 'MULTILEVEL_SEALED_ROUND_IMMUTABLE';
  END IF;
  IF OLD.lifecycle='FROZEN' AND (
    NEW.lifecycle NOT IN ('FROZEN','SEALED')
    OR NEW.participant_pool_wei IS DISTINCT FROM OLD.participant_pool_wei
    OR NEW.carry_onboarding_wei IS DISTINCT FROM OLD.carry_onboarding_wei
    OR NEW.carry_active_wei IS DISTINCT FROM OLD.carry_active_wei
    OR NEW.carry_leader_wei IS DISTINCT FROM OLD.carry_leader_wei
    OR NEW.budget_onboarding_wei IS DISTINCT FROM OLD.budget_onboarding_wei
    OR NEW.budget_active_wei IS DISTINCT FROM OLD.budget_active_wei
    OR NEW.budget_leader_wei IS DISTINCT FROM OLD.budget_leader_wei
    OR NEW.budget_dust_wei IS DISTINCT FROM OLD.budget_dust_wei
    OR NEW.input_fingerprint IS DISTINCT FROM OLD.input_fingerprint
    OR NEW.network IS DISTINCT FROM OLD.network
    OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
    OR NEW.round_id IS DISTINCT FROM OLD.round_id
  ) THEN
    RAISE EXCEPTION 'MULTILEVEL_FROZEN_ROUND_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER multilevel_round_book_guard
  BEFORE UPDATE ON veinvite_multilevel_staging.round_books
  FOR EACH ROW EXECUTE FUNCTION veinvite_multilevel_staging.guard_round_book_v1();

-- X share starts only after a confirmed BASE claim; the offer clock uses
-- chain-confirmed BASE receipt time, never a browser-provided date.
CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.guard_x_share_proof_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_claim record;
BEGIN
  SELECT c.state,c.confirmed_at,e.x_share_wei INTO v_claim
  FROM veinvite_multilevel_staging.claim_legs c
  JOIN veinvite_multilevel_staging.entitlements e
    ON e.entitlement_key=c.entitlement_key
  WHERE c.entitlement_key=NEW.entitlement_key AND c.component='BASE';
  IF NOT FOUND OR v_claim.state<>'CONFIRMED'
     OR v_claim.confirmed_at IS NULL
     OR NEW.claimed_base_at IS DISTINCT FROM v_claim.confirmed_at
     OR v_claim.x_share_wei=0 THEN
    RAISE EXCEPTION 'MULTILEVEL_X_REQUIRES_CONFIRMED_BASE_CLAIM';
  END IF;
  IF TG_OP='UPDATE' AND (
    NEW.entitlement_key IS DISTINCT FROM OLD.entitlement_key
    OR NEW.claimed_base_at IS DISTINCT FROM OLD.claimed_base_at
    OR OLD.verification_state='VERIFIED' AND NEW IS DISTINCT FROM OLD
  ) THEN
    RAISE EXCEPTION 'MULTILEVEL_X_PROOF_IDENTITY_IMMUTABLE';
  END IF;
  IF NEW.verification_state='VERIFIED' AND (
    NEW.verified_at IS NULL OR NEW.verify_after_at IS NULL OR
    NEW.verified_at<NEW.verify_after_at OR
    NEW.verified_at>clock_timestamp()+interval '1 minute'
  ) THEN
    RAISE EXCEPTION 'MULTILEVEL_X_24H_PROOF_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER multilevel_x_proof_guard
  BEFORE INSERT OR UPDATE ON veinvite_multilevel_staging.x_share_proofs
  FOR EACH ROW EXECUTE FUNCTION veinvite_multilevel_staging.guard_x_share_proof_v1();

CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.guard_claim_leg_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_ent record;
BEGIN
  SELECT e.base_wei,e.x_share_wei,b.lifecycle INTO v_ent
  FROM veinvite_multilevel_staging.entitlements e
  JOIN veinvite_multilevel_staging.round_books b
    ON b.network=e.network AND b.policy_version=e.policy_version
       AND b.round_id=e.round_id
  WHERE e.entitlement_key=NEW.entitlement_key;
  IF NOT FOUND OR NEW.amount_wei<=0 OR
      (NEW.component='BASE' AND NEW.amount_wei<>v_ent.base_wei) OR
      (NEW.component='X' AND NEW.amount_wei<>v_ent.x_share_wei) THEN
    RAISE EXCEPTION 'MULTILEVEL_CLAIM_AMOUNT_MISMATCH';
  END IF;
  IF NEW.state IN ('READY','SUBMITTED','CONFIRMED') THEN
    IF v_ent.lifecycle<>'SEALED' THEN
      RAISE EXCEPTION 'MULTILEVEL_ROUND_NOT_SEALED';
    END IF;
    IF NEW.component='X' AND NOT EXISTS (
      SELECT 1 FROM veinvite_multilevel_staging.x_share_proofs x
      WHERE x.entitlement_key=NEW.entitlement_key
        AND x.verification_state='VERIFIED'
        AND x.verified_at>=x.verify_after_at
        AND x.verified_at<=clock_timestamp()
    ) THEN
      RAISE EXCEPTION 'MULTILEVEL_X_NOT_VERIFIED';
    END IF;
  END IF;
  IF NEW.state='CONFIRMED' AND NEW.confirmed_at IS NULL THEN
    RAISE EXCEPTION 'MULTILEVEL_CONFIRMED_TIMESTAMP_REQUIRED';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.entitlement_key IS DISTINCT FROM OLD.entitlement_key
       OR NEW.component IS DISTINCT FROM OLD.component
       OR NEW.amount_wei IS DISTINCT FROM OLD.amount_wei
       OR NEW.claim_leg_key IS DISTINCT FROM OLD.claim_leg_key
       OR (OLD.tx_id IS NOT NULL AND NEW.tx_id IS DISTINCT FROM OLD.tx_id)
       OR OLD.state IN ('CONFIRMED','EXPIRED')
       OR (OLD.state='SUBMITTED' AND NEW.state NOT IN ('SUBMITTED','CONFIRMED','HELD_FOR_REVIEW'))
       OR (OLD.state='READY' AND NEW.state NOT IN ('READY','SUBMITTED','HELD_FOR_REVIEW','EXPIRED'))
       OR (OLD.state='RESERVED' AND NEW.state NOT IN ('RESERVED','READY','HELD_FOR_REVIEW','EXPIRED'))
       OR (OLD.state='HELD_FOR_REVIEW' AND NEW.state NOT IN ('HELD_FOR_REVIEW','READY','EXPIRED'))
    THEN
      RAISE EXCEPTION 'MULTILEVEL_INVALID_CLAIM_TRANSITION';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER multilevel_claim_leg_guard
  BEFORE INSERT OR UPDATE ON veinvite_multilevel_staging.claim_legs
  FOR EACH ROW EXECUTE FUNCTION veinvite_multilevel_staging.guard_claim_leg_v1();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA veinvite_multilevel_staging
  FROM PUBLIC, anon, authenticated;
COMMIT;
