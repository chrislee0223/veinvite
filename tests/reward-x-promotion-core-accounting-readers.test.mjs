import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261008143000_wire_x_promotion_core_accounting_readers_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('outstanding liability adds only the post-base promotion reader', () => {
  assert.match(
    migration,
    /read_reward_x_promotion_post_base_liability_wei/,
  );
  assert.match(
    migration,
    /v_reserved_existing\s*\+\s*v_legacy_reserved\s*\+\s*v_post_base_promotion/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_NEGATIVE_POST_BASE_LIABILITY/,
  );
});

test('cohort commitment subtracts released promotion exactly once', () => {
  assert.match(
    migration,
    /read_reward_x_promotion_cohort_released_wei/,
  );
  assert.match(
    migration,
    /v_queue_committed-v_released_promotion/,
  );
  assert.match(
    migration,
    /v_released_promotion>v_queue_committed/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_RELEASE_COMMITMENT_MISMATCH/,
  );
});

test('accounting bridge does not alter payout or claim functions', () => {
  assert.doesNotMatch(
    migration,
    /create or replace function public\.prepare_reward_cohort_batch/,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.request_reward_claim/,
  );
  assert.doesNotMatch(
    migration,
    /insert into public\.reward_payouts/,
  );
  assert.doesNotMatch(
    migration,
    /update public\.reward_queue_entries/,
  );
});
