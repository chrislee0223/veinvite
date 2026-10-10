import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL(
    '../src/app/api/leaderboard/route.ts',
    import.meta.url,
  ),
  'utf8',
);

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261010133000_add_x_promotion_leaderboard_paid_totals_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('X promotion does not change the recognized referral ranking algorithm', () => {
  assert.match(
    route,
    /const RANKING_ALGORITHM_VERSION = 'recognized_referrals_v3'/,
  );
  assert.doesNotMatch(
    migration,
    /get_lifetime_recognized_referral_ranking_v3_internal/,
  );
});

test('leaderboard promotion augmentation changes only totalRewardWei', () => {
  const helperStart = route.indexOf(
    'async function addPaidXPromotionTotals',
  );
  const helperEnd = route.indexOf(
    'function normalizeComparison',
    helperStart,
  );

  assert.ok(helperStart >= 0);
  assert.ok(helperEnd > helperStart);

  const helper = route.slice(
    helperStart,
    helperEnd,
  );

  assert.match(helper, /totalRewardWei:/);
  assert.doesNotMatch(helper, /completedReferrals:/);
  assert.doesNotMatch(helper, /rank:/);
  assert.doesNotMatch(helper, /rankMovement:/);
});

test('paid promotion totals mirror leaderboard exclusion policy', () => {
  assert.match(
    migration,
    /is_analytics_excluded_wallet/,
  );
  assert.match(
    migration,
    /is_analytics_excluded_invite_code/,
  );
  assert.match(
    migration,
    /is_sybil_v2_referral_invalidated/,
  );
});

test('promotion total read is bounded and server-only', () => {
  assert.match(
    migration,
    /v_wallet_count>250/,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_paid_reward_x_promotion_totals_v1\(text,text\[\]\)\s+to service_role/,
  );
  assert.match(
    migration,
    /revoke all on function public\.get_paid_reward_x_promotion_totals_v1\(text,text\[\]\)\s+from public,anon,authenticated/,
  );
});

test('optional promotion total failure never takes down the core leaderboard', () => {
  assert.match(
    route,
    /core referral totals remain available/,
  );
  assert.match(
    route,
    /return entries;/,
  );
});

test('promotion total is added after ranking and movement normalization', () => {
  const movement = route.indexOf('if (!comparison.available)');
  const augmentation = route.indexOf('addPaidXPromotionTotals', movement);

  assert.ok(movement >= 0);
  assert.ok(augmentation > movement);
});
