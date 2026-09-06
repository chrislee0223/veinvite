import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260906011000_clarify_referral_quality_and_country_pair_integrity.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');

test('operator health distinguishes immutable raw referral gaps from unresolved quality backlog', () => {
  assert.match(migration, /qualified_referral_relationships/);
  assert.match(
    migration,
    /q\.resolved_network is null or q\.resolved_entry_class is null/i,
  );
  assert.match(migration, /referral_relationship_raw_quality_gaps/);
  assert.match(migration, /referral_relationship_resolved_from_evidence/);
});

test('country facts must match the invitation that created the canonical relationship', () => {
  assert.match(
    migration,
    /v_source_invitation_id is distinct from new\.source_invitation_id/i,
  );
  assert.match(
    migration,
    /country fact invitation does not match referral relationship source invitation/i,
  );
  assert.match(migration, /referral_activation_country_facts_integrity_guard/);
});

test('country UNKNOWN semantics and activation chronology fail closed', () => {
  assert.match(
    migration,
    /\(new\.country_source = 'UNKNOWN'\) <> \(new\.country_code = 'UNKNOWN'\)/i,
  );
  assert.match(
    migration,
    /new\.observed_at < v_relationship_effective_at/i,
  );
  assert.match(
    migration,
    /referral_activation_country_facts_unknown_consistency_check/i,
  );
});

test('country integrity helper stays behind the server boundary', () => {
  assert.match(
    migration,
    /revoke all on function public\.validate_referral_activation_country_fact_integrity\(\)\s+from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.validate_referral_activation_country_fact_integrity\(\)\s+to postgres, service_role/i,
  );
});
