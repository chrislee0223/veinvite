import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260923063000_audit_sybil_v2_runtime_toggles.sql';

test('Sybil v2 runtime rollout fields are appended to the existing reward audit ledger', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  for (const column of [
    'previous_sybil_v2_enforcement_enabled',
    'sybil_v2_enforcement_enabled',
    'previous_sybil_v2_enforcement_changed_at',
    'sybil_v2_enforcement_changed_at',
    'previous_sybil_v2_enforcement_reason',
    'sybil_v2_enforcement_reason',
    'previous_sybil_v2_automatic_observation_started_at',
    'sybil_v2_automatic_observation_started_at',
  ]) {
    assert.match(sql, new RegExp(column, 'u'));
  }

  assert.match(
    sql,
    /alter table public\.reward_runtime_config_events/u,
  );
  assert.doesNotMatch(
    sql,
    /create table public\.sybil_v2_runtime/u,
  );
});

test('reward runtime audit trigger watches every Sybil v2 rollout field', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /new\.sybil_v2_enforcement_enabled is distinct from old\.sybil_v2_enforcement_enabled/u,
  );
  assert.match(
    sql,
    /new\.sybil_v2_enforcement_changed_at is distinct from old\.sybil_v2_enforcement_changed_at/u,
  );
  assert.match(
    sql,
    /new\.sybil_v2_enforcement_reason is distinct from old\.sybil_v2_enforcement_reason/u,
  );
  assert.match(
    sql,
    /new\.sybil_v2_automatic_observation_started_at is distinct from old\.sybil_v2_automatic_observation_started_at/u,
  );

  assert.match(
    sql,
    /after update of[\s\S]*sybil_v2_enforcement_enabled[\s\S]*sybil_v2_enforcement_changed_at[\s\S]*sybil_v2_enforcement_reason[\s\S]*sybil_v2_automatic_observation_started_at/u,
  );
});

test('audit event stores old and new Sybil v2 values plus database actor', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /old\.sybil_v2_enforcement_enabled/u);
  assert.match(sql, /new\.sybil_v2_enforcement_enabled/u);
  assert.match(sql, /old\.sybil_v2_enforcement_changed_at/u);
  assert.match(sql, /new\.sybil_v2_enforcement_changed_at/u);
  assert.match(sql, /old\.sybil_v2_enforcement_reason/u);
  assert.match(sql, /new\.sybil_v2_enforcement_reason/u);
  assert.match(
    sql,
    /old\.sybil_v2_automatic_observation_started_at/u,
  );
  assert.match(
    sql,
    /new\.sybil_v2_automatic_observation_started_at/u,
  );
  assert.match(sql, /current_user/u);
});
