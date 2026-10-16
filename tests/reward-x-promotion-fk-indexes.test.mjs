import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261016210000_index_x_promotion_foreign_keys_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

const expected = [
  ['reward_x_promotion_obligations_source_receipt_idx', 'reward_x_promotion_obligations', 'source_allocation_receipt_id'],
  ['reward_x_promotion_payout_intents_source_receipt_idx', 'reward_x_promotion_payout_intents', 'source_allocation_receipt_id'],
  ['reward_x_promotion_post_submissions_obligation_idx', 'reward_x_promotion_post_submissions', 'obligation_id'],
  ['reward_x_promotion_post_submissions_split_idx', 'reward_x_promotion_post_submissions', 'split_id'],
  ['reward_x_promotion_post_verifications_obligation_idx', 'reward_x_promotion_post_verifications', 'obligation_id'],
  ['reward_x_promotion_post_verifications_split_idx', 'reward_x_promotion_post_verifications', 'split_id'],
  ['reward_x_promotion_receipts_source_receipt_idx', 'reward_x_promotion_receipts', 'source_allocation_receipt_id'],
  ['reward_x_promotion_splits_source_receipt_idx', 'reward_x_promotion_splits', 'source_allocation_receipt_id'],
];

test('all X promotion foreign-key covering indexes are present', () => {
  for (const [name, table, column] of expected) {
    assert.match(
      migration,
      new RegExp(
        `create index if not exists ${name}\\s+on public\\.${table}\\(${column}\\)`,
      ),
    );
  }
});

test('index hardening changes no reward functions or runtime gates', () => {
  assert.doesNotMatch(migration, /create or replace function/i);
  assert.doesNotMatch(migration, /reward_runtime_config/i);
  assert.doesNotMatch(migration, /update\s+public\./i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\./i);
});
