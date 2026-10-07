import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261008034500_add_x_promotion_shadow_projection_v1.sql',
    import.meta.url,
  ),
  'utf8',
);
const route = await readFile(
  new URL('../src/app/api/cron/vote-reconcile/route.ts', import.meta.url),
  'utf8',
);
const reservation = await readFile(
  new URL('../src/lib/rewards/rewardReservation.ts', import.meta.url),
  'utf8',
);
const claim = await readFile(
  new URL('../src/app/api/rewards/claims/route.ts', import.meta.url),
  'utf8',
);
const payout = await readFile(
  new URL('../src/lib/rewards/automaticRewardPayout.ts', import.meta.url),
  'utf8',
);

test('v1 shadow projection has one database calculation authority', () => {
  assert.match(
    migration,
    /create or replace function public\.calculate_reward_x_promotion_split_v1/,
  );
  assert.match(migration, /v_rate_bps constant integer := 1000/);
  assert.match(
    migration,
    /v_cap_wei constant numeric\(78,0\) := 10000000000000000000/,
  );
  assert.match(
    migration,
    /trunc\(v_reservation \* v_rate_bps \/ 10000\)/,
  );
  assert.match(
    migration,
    /greatest\(v_reservation - 1, 0\)/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_CALCULATION_MISMATCH/,
  );
});

test('shadow projection is bounded to reservations created after shadow activation', () => {
  assert.match(
    migration,
    /q\.reserved_at>=v_cfg\.reward_x_promotion_shadow_started_at/,
  );
  assert.match(
    migration,
    /q\.reserved_at<v_cfg\.reward_x_promotion_live_started_at/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_OUTSIDE_SHADOW_WINDOW/,
  );
});

test('shadow projection is isolated from core reward authority', () => {
  assert.doesNotMatch(
    reservation,
    /rewardXPromotionShadow|sync_reward_x_promotion_shadow_splits/,
  );
  assert.doesNotMatch(
    claim,
    /rewardXPromotionShadow|sync_reward_x_promotion_shadow_splits/,
  );
  assert.doesNotMatch(
    payout,
    /rewardXPromotionShadow|sync_reward_x_promotion_shadow_splits/,
  );
  assert.match(
    migration,
    /Shadow-only accounting projection\. It never mutates reward queue, payout, receipt, liability, cohort budget, or on-chain transfer state\./,
  );
});

test('shadow cron failures are warnings and cannot fail the reward recovery loop', () => {
  assert.match(route, /runRewardXPromotionShadowSync/);
  assert.match(route, /X_PROMOTION_SHADOW_SYNC_FAILED/);
  assert.match(
    route,
    /warnings\.push\([\s\S]*X_PROMOTION_SHADOW_SYNC_FAILED/,
  );
  assert.doesNotMatch(
    route,
    /errors\.push\([\s\S]{0,120}X_PROMOTION_SHADOW_SYNC_FAILED/,
  );
});
