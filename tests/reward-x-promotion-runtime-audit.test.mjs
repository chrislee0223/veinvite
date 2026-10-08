import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261008104500_harden_x_promotion_runtime_audit_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('X promotion runtime changes have a dedicated append-only audit trail', () => {
  assert.match(
    migration,
    /create table if not exists public\.reward_x_promotion_runtime_events/,
  );
  assert.match(
    migration,
    /after update of[\s\S]*reward_x_promotion_shadow_enabled[\s\S]*reward_x_promotion_live_started_at/,
  );
  assert.match(
    migration,
    /before update or delete on public\.reward_x_promotion_runtime_events/,
  );
  assert.match(
    migration,
    /prevent_operator_ledger_mutation/,
  );
});

test('X promotion activation timestamps cannot be rewritten after first set', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SHADOW_START_IMMUTABLE/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_LIVE_START_IMMUTABLE/,
  );
  assert.match(
    migration,
    /old\.reward_x_promotion_shadow_started_at is not null/,
  );
  assert.match(
    migration,
    /old\.reward_x_promotion_live_started_at is not null/,
  );
});

test('runtime audit table is server-readable only', () => {
  assert.match(
    migration,
    /alter table public\.reward_x_promotion_runtime_events enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.reward_x_promotion_runtime_events[\s\S]*from public,anon,authenticated,service_role/,
  );
  assert.match(
    migration,
    /grant select on table public\.reward_x_promotion_runtime_events to service_role/,
  );
});
