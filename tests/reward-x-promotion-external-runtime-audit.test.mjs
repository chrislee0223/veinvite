import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261014034000_audit_x_promotion_external_runtime_boundary_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('X promotion runtime audit trigger includes external verification boundaries', () => {
  assert.match(
    migration,
    /reward_x_promotion_external_verification_ready/,
  );
  assert.match(
    migration,
    /reward_x_promotion_external_verification_started_at/,
  );
  assert.match(
    migration,
    /execute function public\.log_reward_x_promotion_runtime_event\(\)/,
  );
});

test('audit fix changes only the runtime audit trigger', () => {
  assert.doesNotMatch(migration, /update public\.reward_runtime_config/i);
  assert.doesNotMatch(migration, /reward_x_promotion_payout_enabled\s*=\s*true/i);
  assert.doesNotMatch(migration, /reward_x_promotion_external_verification_ready\s*=\s*true/i);
  assert.doesNotMatch(migration, /create table|alter table/i);
});
