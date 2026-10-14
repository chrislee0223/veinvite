import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261014213000_require_x_promotion_payout_before_offers_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('external verification readiness requires payout to be enabled', () => {
  assert.match(
    migration,
    /not reward_x_promotion_external_verification_ready[\s\S]*or reward_x_promotion_payout_enabled/i,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_EXTERNAL_READY_REQUIRES_PAYOUT/,
  );
});

test('payout interlock is checked before external runtime readiness', () => {
  const payoutIndex =
    migration.indexOf(
      'REWARD_X_PROMOTION_EXTERNAL_READY_REQUIRES_PAYOUT',
    );
  const runtimeIndex =
    migration.indexOf(
      'REWARD_X_PROMOTION_EXTERNAL_RUNTIME_NOT_READY',
    );

  assert.ok(payoutIndex >= 0);
  assert.ok(runtimeIndex > payoutIndex);
});

test('pause direction remains supported', () => {
  assert.match(
    migration,
    /old\.reward_x_promotion_external_verification_ready=true[\s\S]*new\.reward_x_promotion_external_verification_ready=false/,
  );
});

test('guard stays inaccessible as a direct API function', () => {
  assert.match(
    migration,
    /revoke all on function public\.guard_reward_x_promotion_external_verification_readiness_v1\(\)[\s\S]*from public,anon,authenticated,service_role/i,
  );
});
