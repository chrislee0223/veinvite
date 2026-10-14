import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261015073000_harden_x_promotion_runtime_freshness_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('LIVE split requires payout and external gates before reducing the base transfer', () => {
  assert.match(
    migration,
    /not v_cfg\.reward_x_promotion_payout_enabled[\s\S]*not v_cfg\.reward_x_promotion_external_verification_ready[\s\S]*return new/,
  );
});

test('LIVE split requires a fresh external runtime check', () => {
  assert.match(
    migration,
    /read_reward_x_promotion_external_runtime_readiness_v1\([\s\S]*new\.network,[\s\S]*1200/,
  );
  assert.match(
    migration,
    /if not coalesce\(\(v_runtime->>'ready'\)::boolean,false\) then[\s\S]*return new/,
  );
});

test('24-hour opportunity does not start while new offers are paused', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_NEW_OFFERS_PAUSED/,
  );
  assert.match(
    migration,
    /reward_x_promotion_payout_enabled/,
  );
  assert.match(
    migration,
    /reward_x_promotion_external_verification_ready/,
  );
});

test('24-hour opportunity requires a fresh runtime readiness record', () => {
  assert.match(
    migration,
    /read_reward_x_promotion_external_runtime_readiness_v1\([\s\S]*v_obligation\.network,[\s\S]*1200/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_EXTERNAL_RUNTIME_STALE/,
  );
});

test('freshness hardening never releases or pays an existing promotion obligation', () => {
  assert.doesNotMatch(
    migration,
    /release_reward_x_promotion_obligation_v1|finalize_reward_x_promotion_payout_v1/,
  );
});
