import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261011205500_guard_x_promotion_live_activation_with_readiness_v2.sql',
    import.meta.url,
  ),
  'utf8',
);

test('activation guard does not activate X promotion itself', () => {
  assert.doesNotMatch(
    migration,
    /update\s+public\.reward_runtime_config/i,
  );
  assert.doesNotMatch(
    migration,
    /set\s+reward_x_promotion_enabled\s*=\s*true/i,
  );
});

test('activation guard requires current readiness v2', () => {
  assert.match(
    migration,
    /read_reward_x_promotion_offer_readiness_v2\('mainnet',5\)/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_LIVE_ACTIVATION_NOT_READY/,
  );
});

test('activation boundary is serialized with reservation and batch planning', () => {
  assert.match(
    migration,
    /veinvite_reward_reservation_mainnet/,
  );
  assert.match(
    migration,
    /veinvite_predictive_reward_mainnet_/,
  );
  assert.match(migration, /pg_advisory_xact_lock/);
});

test('activation guard requires fresh immutable live start inputs', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_LIVE_START_MISSING/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_LIVE_START_NOT_FRESH/,
  );
  assert.match(
    migration,
    /reward_x_promotion_policy_version<>'x-promotion-split-v1'/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SHADOW_REQUIRED/,
  );
});

test('activation guard remains server-internal', () => {
  assert.match(
    migration,
    /revoke all on function public\.guard_reward_x_promotion_live_activation_interlock\(\)[\s\S]*from public,anon,authenticated,service_role/,
  );
});
