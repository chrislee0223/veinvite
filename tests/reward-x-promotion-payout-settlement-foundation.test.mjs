import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009160000_add_x_promotion_payout_settlement_foundation_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('promotion payout journals are separate and immutable', () => {
  for (const table of [
    'reward_x_promotion_payout_checkpoints',
    'reward_x_promotion_payout_signed_transactions',
    'reward_x_promotion_payout_submissions',
    'reward_x_promotion_payout_settlements',
    'reward_x_promotion_receipts',
  ]) {
    assert.match(migration, new RegExp(`public\\.${table}`));
  }
  assert.match(
    migration,
    /REWARD_X_PROMOTION_PAYOUT_JOURNAL_IMMUTABLE/,
  );
});

test('promotion payout signing is live-gated and security-gated', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_LIVE_DISABLED/,
  );
  assert.match(
    migration,
    /reward_x_promotion_security_clear_v1/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SIGNING_AUTHORITY_NOT_READY/,
  );
});

test('signed transaction and submission are persisted atomically', () => {
  assert.match(
    migration,
    /register_reward_x_promotion_signed_submission_v1/,
  );
  assert.match(
    migration,
    /insert into public\.reward_x_promotion_payout_signed_transactions[\s\S]*insert into public\.reward_x_promotion_payout_submissions/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SIGNED_SUBMISSION_PARTIAL_OR_MISMATCH/,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.register_reward_x_promotion_submission_v1/,
  );
});

test('promotion tx id cannot be reused by referral payout journals', () => {
  assert.match(
    migration,
    /reward_payout_signed_transactions/,
  );
  assert.match(
    migration,
    /reward_payout_transaction_submissions/,
  );
  assert.match(
    migration,
    /reward_payout_transaction_settlements/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_TX_ALREADY_USED_BY_REFERRAL_REWARD/,
  );
});

test('settlement requires one finalized clause after checkpoint', () => {
  assert.match(migration, /p_clause_count<>1/);
  assert.match(
    migration,
    /p_finalized_head_number<p_block_number/,
  );
  assert.match(
    migration,
    /p_block_number<=v_checkpoint\.block_number/,
  );
});

test('paid obligation requires immutable settlement and receipt proof', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_PAID_PROOF_MISSING/,
  );
  assert.match(
    migration,
    /reward_x_promotion_payout_settlements/,
  );
  assert.match(
    migration,
    /reward_x_promotion_receipts/,
  );
});

test('signed promotion transaction prevents release', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SIGNED_TX_PREVENTS_RELEASE/,
  );
});

test('promotion receipt financial record is immutable and has no mutable read flag', () => {
  const receiptStart = migration.indexOf(
    'create table if not exists public.reward_x_promotion_receipts',
  );
  const receiptEnd = migration.indexOf(
    'create index if not exists reward_x_promotion_payout_settlements_paid_idx',
  );
  const receiptSchema = migration.slice(receiptStart, receiptEnd);
  assert.doesNotMatch(receiptSchema, /seen_at/);
});

test('finalization is not blocked by the live runtime switch', () => {
  const start = migration.indexOf(
    'create or replace function public.finalize_reward_x_promotion_payout_v1',
  );
  const end = migration.indexOf(
    'create or replace function public.guard_reward_x_promotion_obligation_mutation',
  );
  const body = migration.slice(start, end);
  assert.doesNotMatch(
    body,
    /reward_x_promotion_enabled/,
  );
});


test('terminal Sybil release skips atomically committed promotion payouts', () => {
  assert.match(
    migration,
    /release_terminal_reward_x_promotion_security_v1/,
  );
  assert.match(
    migration,
    /reward_x_promotion_payout_signed_transactions/,
  );
  assert.match(
    migration,
    /committedSkippedCount/,
  );
});
