import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261011151500_include_paid_x_promotion_in_recovery_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('invalidation recovery includes finalized X promotion value', () => {
  const start = migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.upsert_reward_recovery_obligation_for_invalidation',
  );
  const end = migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.upsert_reward_recovery_obligation_for_restriction',
  );
  assert.ok(start >= 0 && end > start);
  const fn = migration.slice(start, end);
  assert.match(fn, /reward_x_promotion_receipts/);
  assert.match(
    fn,
    /coalesce\(v_receipt\.amount_wei,0\)[\s\S]*coalesce\(v_promotion_receipt\.amount_wei,0\)/,
  );
  assert.match(fn, /xPromotionPaidWei/);
});

test('restriction recovery includes finalized X promotion value', () => {
  const start = migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.upsert_reward_recovery_obligation_for_restriction',
  );
  const end = migration.indexOf(
    'create or replace function public.sync_reward_recovery_after_x_promotion_receipt_v1',
  );
  assert.ok(start >= 0 && end > start);
  const fn = migration.slice(start, end);
  assert.match(fn, /reward_x_promotion_receipts/);
  assert.match(
    fn,
    /coalesce\(v_receipt\.amount_wei,0\)[\s\S]*coalesce\(v_promotion_receipt\.amount_wei,0\)/,
  );
  assert.match(fn, /xPromotionPaidWei/);
});

test('late promotion receipt replays current recovery authority', () => {
  const fn = migration.slice(
    migration.indexOf(
      'create or replace function public.sync_reward_recovery_after_x_promotion_receipt_v1',
    ),
  );
  assert.match(
    fn,
    /after insert on public\.reward_x_promotion_receipts/,
  );
  assert.match(
    fn,
    /upsert_reward_recovery_obligation_for_invalidation/,
  );
  assert.match(
    fn,
    /upsert_reward_recovery_obligation_for_restriction/,
  );
});

test('active invalidation remains preferred over active restriction', () => {
  const fn = migration.slice(
    migration.indexOf(
      'create or replace function public.sync_reward_recovery_after_x_promotion_receipt_v1',
    ),
  );
  const invalidation = fn.indexOf(
    'upsert_reward_recovery_obligation_for_invalidation',
  );
  const restriction = fn.indexOf(
    'upsert_reward_recovery_obligation_for_restriction',
  );
  assert.ok(invalidation >= 0 && restriction > invalidation);
  assert.match(
    fn,
    /if v_invalidation_id is not null then[\s\S]*return new;/,
  );
});

test('patch does not enable X promotion or payout runtime', () => {
  assert.doesNotMatch(
    migration,
    /set\s+reward_x_promotion_enabled\s*=\s*true/i,
  );
  assert.doesNotMatch(
    migration,
    /set\s+reward_x_promotion_payout_enabled\s*=\s*true/i,
  );
});
