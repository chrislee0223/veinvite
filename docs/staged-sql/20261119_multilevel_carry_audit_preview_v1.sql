-- VeInvite multilevel PREVIEW-only carryover and return source provenance.
-- Apply after private ledger + integrity overlays. DO NOT run on Production.
BEGIN;
CREATE TABLE IF NOT EXISTS veinvite_multilevel_staging.category_carry_forward (
  network text NOT NULL,
  policy_version text NOT NULL,
  source_round_id bigint NOT NULL,
  destination_round_id bigint NOT NULL,
  category text NOT NULL CHECK (category IN ('onboarding','active','leader')),
  amount_wei numeric(78,0) NOT NULL CHECK (amount_wei >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(network,policy_version,source_round_id,category),
  FOREIGN KEY(network,policy_version,source_round_id)
    REFERENCES veinvite_multilevel_staging.round_books(network,policy_version,round_id)
    ON DELETE RESTRICT,
  CONSTRAINT forward_once_to_next_round
    CHECK(destination_round_id=source_round_id+1)
);
CREATE INDEX IF NOT EXISTS multilevel_carry_destination_idx
  ON veinvite_multilevel_staging.category_carry_forward(network,policy_version,destination_round_id);

CREATE TRIGGER multilevel_carry_no_mutate
  BEFORE UPDATE OR DELETE ON veinvite_multilevel_staging.category_carry_forward
  FOR EACH ROW EXECUTE FUNCTION veinvite_multilevel_staging.forbid_money_history_mutation_v1();

ALTER TABLE veinvite_multilevel_staging.return_ledger
  ADD COLUMN IF NOT EXISTS source_event_key text,
  ADD COLUMN IF NOT EXISTS source_level_no smallint;
ALTER TABLE veinvite_multilevel_staging.return_ledger
  DROP CONSTRAINT IF EXISTS return_provenance_shape;
ALTER TABLE veinvite_multilevel_staging.return_ledger
  ADD CONSTRAINT return_provenance_shape CHECK (
    (reason NOT IN ('MISSING_UPLINE','INACTIVE_UPLINE') OR
      (source_event_key IS NOT NULL AND source_level_no BETWEEN 1 AND 5))
    AND
    (reason NOT IN ('CLAIM_EXPIRED','X_EXPIRED') OR source_entitlement_key IS NOT NULL)
  );

ALTER TABLE veinvite_multilevel_staging.category_carry_forward ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON veinvite_multilevel_staging.category_carry_forward FROM PUBLIC,anon,authenticated;
COMMIT;
