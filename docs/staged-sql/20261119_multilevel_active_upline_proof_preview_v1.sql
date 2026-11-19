-- VeInvite multilevel preview-only: active-upline proof must be independent.
-- Does not validate the real chain itself. Only approved, trusted source
-- evidence may be inserted after finality, identity and Sybil checks.
-- Do NOT use in Production.
BEGIN;
CREATE TABLE IF NOT EXISTS veinvite_multilevel_staging.verified_round_activity (
  network text NOT NULL CHECK (network IN ('testnet','testnet-staging')),
  policy_version text NOT NULL CHECK (policy_version='multilevel-v1'),
  round_id bigint NOT NULL CHECK (round_id>=1),
  wallet text NOT NULL CHECK (wallet ~ '^0x[0-9a-f]{40}$'),
  chain_proof_fingerprint text NOT NULL CHECK (chain_proof_fingerprint ~ '^[a-f0-9]{64}$'),
  review_reference text NOT NULL CHECK (length(review_reference) BETWEEN 8 AND 256),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network,policy_version,round_id,wallet),
  FOREIGN KEY (network,policy_version,round_id)
    REFERENCES veinvite_multilevel_staging.round_books(network,policy_version,round_id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS multilevel_activity_proof_round_idx
  ON veinvite_multilevel_staging.verified_round_activity(network,policy_version,round_id);

CREATE TRIGGER multilevel_activity_proof_no_mutate
  BEFORE UPDATE OR DELETE ON veinvite_multilevel_staging.verified_round_activity
  FOR EACH ROW EXECUTE FUNCTION
    veinvite_multilevel_staging.forbid_money_history_mutation_v1();

CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.guard_activity_proof_insert_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE v_lifecycle text;
BEGIN
  SELECT lifecycle INTO v_lifecycle
  FROM veinvite_multilevel_staging.round_books
  WHERE network=NEW.network AND policy_version=NEW.policy_version
    AND round_id=NEW.round_id FOR SHARE;
  IF v_lifecycle IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'MULTILEVEL_ACTIVITY_PROOF_ROUND_NOT_DRAFT';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER multilevel_activity_proof_round_gate
  BEFORE INSERT ON veinvite_multilevel_staging.verified_round_activity
  FOR EACH ROW EXECUTE FUNCTION
    veinvite_multilevel_staging.guard_activity_proof_insert_v1();

-- The snapshot's active=true/false MUST match independent reviewed activity
-- for each known ancestor. Never pay on a self-attested boolean alone.
CREATE OR REPLACE FUNCTION veinvite_multilevel_staging.guard_seal_activity_proof_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE v_event record; v_item jsonb; v_wallet text;
DECLARE v_claimed_active boolean; v_verified_active boolean;
BEGIN
  IF NEW.lifecycle<>'SEALED' OR OLD.lifecycle='SEALED' THEN
    RETURN NEW;
  END IF;
  FOR v_event IN
    SELECT e.actor_wallet,e.event_kind,e.evidence
    FROM veinvite_multilevel_staging.verified_events e
    WHERE e.network=NEW.network AND e.policy_version=NEW.policy_version
      AND e.round_id=NEW.round_id
  LOOP
    IF v_event.event_kind='ACTIVE' AND NOT EXISTS (
      SELECT 1 FROM veinvite_multilevel_staging.verified_round_activity a
      WHERE a.network=NEW.network AND a.policy_version=NEW.policy_version
        AND a.round_id=NEW.round_id AND a.wallet=v_event.actor_wallet
    ) THEN
      RAISE EXCEPTION 'MULTILEVEL_ACTIVE_EVENT_MISSING_ACTIVITY_PROOF';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_event.evidence->'uplines')
    LOOP
      v_wallet:=v_item->>'wallet';
      IF v_wallet IS NULL THEN CONTINUE; END IF;
      v_claimed_active:=(v_item->>'active')::boolean;
      SELECT EXISTS (
        SELECT 1 FROM veinvite_multilevel_staging.verified_round_activity a
        WHERE a.network=NEW.network AND a.policy_version=NEW.policy_version
          AND a.round_id=NEW.round_id AND a.wallet=v_wallet
      ) INTO v_verified_active;
      IF v_claimed_active IS DISTINCT FROM v_verified_active THEN
        RAISE EXCEPTION 'MULTILEVEL_UPLINE_ACTIVITY_PROOF_MISMATCH';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER multilevel_round_seal_activity_proof
  BEFORE UPDATE ON veinvite_multilevel_staging.round_books
  FOR EACH ROW EXECUTE FUNCTION
    veinvite_multilevel_staging.guard_seal_activity_proof_v1();

ALTER TABLE veinvite_multilevel_staging.verified_round_activity
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON veinvite_multilevel_staging.verified_round_activity
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA veinvite_multilevel_staging
  FROM PUBLIC,anon,authenticated;
COMMIT;
