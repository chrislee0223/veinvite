import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261015143000_guard_x_promotion_offer_on_current_security_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('promotion obligation does not enter HELD while current Sybil clearance is absent', () => {
  assert.match(
    migration,
    /activate_reward_x_promotion_obligation_v1[\s\S]*reward_x_promotion_security_clear_v1\([\s\S]*v_code[\s\S]*v_obligation\.network/,
  );
  assert.match(
    migration,
    /raise exception 'REWARD_X_PROMOTION_SECURITY_NOT_CLEAR'/,
  );
});

test('24 hour opportunity creation rechecks current Sybil clearance at the DB insert boundary', () => {
  assert.match(
    migration,
    /validate_reward_x_promotion_opportunity_insert[\s\S]*not public\.reward_x_promotion_security_clear_v1\([\s\S]*new\.invite_code[\s\S]*new\.network/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_OPPORTUNITY_SECURITY_NOT_CLEAR/,
  );
});

test('hardening preserves existing base payout proof and terminal security guards', () => {
  assert.match(migration, /REWARD_X_PROMOTION_BASE_PAYOUT_MISMATCH/);
  assert.match(migration, /REWARD_X_PROMOTION_BASE_RECEIPT_MISSING/);
  assert.match(migration, /public\.is_sybil_v2_referral_invalidated/);
  assert.match(migration, /public\.sybil_v2_wallet_restrictions/);
});

test('hardening does not alter payout, split, amount, or expiry functions', () => {
  assert.doesNotMatch(migration, /create or replace function public\.calculate_reward_x_promotion_split_v1/);
  assert.doesNotMatch(migration, /create or replace function public\.prepare_reward_cohort_batch/);
  assert.doesNotMatch(migration, /create or replace function public\.finalize_reward_x_promotion_payout_v1/);
  assert.doesNotMatch(migration, /create or replace function public\.expire_reward_x_promotion_opportunities_v1/);
});
