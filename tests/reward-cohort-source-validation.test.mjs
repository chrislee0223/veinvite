import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20260904203600_validate_reward_cohort_binding_source.sql', import.meta.url),
  'utf8',
);

test('cohort source is derived from entry evidence rather than trusted input', () => {
  assert.match(migration, /v_expected_source text/);
  assert.match(migration, /v_expected_source := 'ROUND_MATCH'/);
  assert.match(migration, /v_expected_source := 'BOOTSTRAP_CARRY_FORWARD'/);
  assert.match(
    migration,
    /new\.reward_cohort_binding_source <> v_expected_source/,
  );
  assert.match(migration, /REWARD_COHORT_BINDING_SOURCE_EVIDENCE_MISMATCH/);
});

test('a source cannot exist without a complete cohort binding', () => {
  assert.match(migration, /REWARD_COHORT_BINDING_SOURCE_WITHOUT_BINDING/);
  assert.match(migration, /REWARD_COHORT_BINDING_SOURCE_IMMUTABLE/);
});
