-- VeInvite preview-only index hardening after Supabase DB advisor review.
-- Do NOT execute on production. No existing public tables or business logic altered.
BEGIN;
CREATE INDEX IF NOT EXISTS multilevel_return_source_lookup_idx
  ON veinvite_multilevel_staging.return_ledger(
    network,policy_version,source_round_id,category,source_event_key,source_level_no,reason
  );
CREATE INDEX IF NOT EXISTS multilevel_return_entitlement_fk_idx
  ON veinvite_multilevel_staging.return_ledger(source_entitlement_key)
  WHERE source_entitlement_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS multilevel_round_policy_fk_idx
  ON veinvite_multilevel_staging.round_books(policy_version);
COMMIT;
