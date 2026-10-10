import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL(
    '../src/app/api/rewards/x-promotion/open/route.ts',
    import.meta.url,
  ),
  'utf8',
);

test('X promotion open route is authenticated, same-origin, and rate-limited', () => {
  assert.match(route, /sameOrigin/);
  assert.match(route, /requireWalletSession/);
  assert.match(route, /x_promotion_open_wallet/);
  assert.match(route, /x_promotion_open_invite/);
});

test('new opportunities cannot open while LIVE is disabled', () => {
  assert.match(
    route,
    /reward_x_promotion_enabled,reward_x_promotion_live_started_at/,
  );
  assert.match(
    route,
    /if \(!newOffersEnabled\)[\s\S]*LIVE_DISABLED/,
  );
});

test('opportunity creation is bound to the LIVE split owner wallet', () => {
  assert.match(
    route,
    /reward_x_promotion_splits/,
  );
  assert.match(route, /\.eq\('mode', 'LIVE'\)/);
  assert.match(
    route,
    /split\.recipient_wallet\.toLowerCase\(\)[\s\S]*wallet/,
  );
});

test('open route reuses authoritative obligation and opportunity RPCs', () => {
  assert.match(
    route,
    /activate_reward_x_promotion_obligation_v1/,
  );
  assert.match(
    route,
    /create_reward_x_promotion_opportunity_v1/,
  );
});

test('open route cannot mutate or execute core referral payout authority', () => {
  assert.doesNotMatch(
    route,
    /\.from\('reward_queue_entries'\)[\s\S]*\.(insert|update|delete|upsert)\(/,
  );
  assert.doesNotMatch(
    route,
    /\.from\('reward_payouts'\)[\s\S]*\.(insert|update|delete|upsert)\(/,
  );
  assert.doesNotMatch(
    route,
    /finalize_reward_payout_manifest|prepare_reward_cohort_batch|request_reward_claim/,
  );
});
