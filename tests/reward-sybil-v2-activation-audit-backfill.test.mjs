import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260924053000_backfill_sybil_v2_activation_audit.sql';

test('existing Sybil v2 activation state is preserved', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /if v_enabled is false then[\s\S]*update public\.reward_runtime_config/u,
  );
  assert.match(
    sql,
    /where id = 1\s+and sybil_v2_enforcement_enabled is false/u,
  );
  assert.match(
    sql,
    /recorded_at[\s\S]*c\.sybil_v2_enforcement_changed_at/u,
  );
});

test('activation audit backfill is idempotent', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /and not exists \([\s\S]*from public\.reward_runtime_config_events e/u,
  );
  assert.match(
    sql,
    /e\.sybil_v2_enforcement_changed_at =\s*c\.sybil_v2_enforcement_changed_at/u,
  );
  assert.match(
    sql,
    /e\.sybil_v2_automatic_observation_started_at =\s*c\.sybil_v2_automatic_observation_started_at/u,
  );
});

test('activation audit repair does not touch reward authority tables', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.doesNotMatch(sql, /update public\.invitations/u);
  assert.doesNotMatch(sql, /update public\.reward_queue_entries/u);
  assert.doesNotMatch(sql, /update public\.reward_receipts/u);
  assert.doesNotMatch(sql, /update public\.reward_payout/u);
});

test('fresh environments still fail closed unless activation invariants are complete', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /SYBIL_V2_RUNTIME_CONFIG_MISSING/u);
  assert.match(sql, /SYBIL_V2_ACTIVATION_AUDIT_PRECONDITION_FAILED/u);
  assert.match(
    sql,
    /sybil_v2_automatic_observation_started_at =\s*coalesce\(sybil_v2_automatic_observation_started_at, v_now\)/u,
  );
});
