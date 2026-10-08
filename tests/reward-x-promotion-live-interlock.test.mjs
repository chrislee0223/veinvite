import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261008144500_add_x_promotion_live_activation_interlock_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('LIVE activation is hard-blocked until a later readiness migration', () => {
  assert.match(
    migration,
    /old\.reward_x_promotion_enabled=false[\s\S]*new\.reward_x_promotion_enabled=true/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_LIVE_ACTIVATION_NOT_READY/,
  );
  assert.match(
    migration,
    /before update of reward_x_promotion_enabled/,
  );
});

test('queue split trigger is dormant while LIVE is disabled', () => {
  assert.match(
    migration,
    /if not v_cfg\.reward_x_promotion_enabled then[\s\S]*return new;/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_LIVE_START_MISSING/,
  );
  assert.match(
    migration,
    /after insert on public\.reward_queue_entries/,
  );
});

test('new LIVE reservation is split from the fixed net queue amount', () => {
  assert.match(
    migration,
    /calculate_reward_x_promotion_split_v1\([\s\S]*new\.reserved_amount_wei/,
  );
  assert.match(
    migration,
    /new\.reserved_at<v_cfg\.reward_x_promotion_live_started_at/,
  );
  assert.match(
    migration,
    /'LIVE'/,
  );
  assert.match(
    migration,
    /v_invitation\.reward_cohort_round_id/,
  );
  assert.match(
    migration,
    /v_invitation\.reward_funding_allocation_receipt_id/,
  );
});

test('LIVE split creation fails closed instead of silently skipping conflicts', () => {
  assert.doesNotMatch(
    migration,
    /on conflict[\s\S]*do nothing/i,
  );
  assert.match(
    migration,
    /insert into public\.reward_x_promotion_splits/,
  );
});

test('interlock foundation does not change claim or payout functions', () => {
  assert.doesNotMatch(
    migration,
    /create or replace function public\.request_reward_claim/,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.prepare_reward_cohort_batch/,
  );
  assert.doesNotMatch(
    migration,
    /insert into public\.reward_payouts/,
  );
});
