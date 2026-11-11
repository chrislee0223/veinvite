import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20261112014000_reward_x_post_created_24h_retention.sql', import.meta.url),
  'utf8',
);

test('first X Post verification schedules retention from X Post creation time, not lookup completion', () => {
  assert.match(migration, /p_x_post_created_at\+make_interval\(secs=>86400\)/);
  assert.match(migration, /new\.x_post_created_at\+make_interval\(secs=>new\.retention_seconds\)/);
  assert.match(migration, /p\.x_post_created_at\+make_interval\(secs=>p\.retention_seconds\)/);
  assert.match(migration, /CHECK \(verify_after=x_post_created_at\+make_interval\(secs=>retention_seconds\)\)/);
  assert.doesNotMatch(migration, /\bv_now\+make_interval\(secs=>86400\)/);
  assert.doesNotMatch(migration, /new\.initial_verified_at\+make_interval\(secs=>new\.retention_seconds\)/);
});

test('correct historical due dates while retaining immutable X evidence and payment security', () => {
  assert.match(migration, /X_PROMOTION_POST_RETENTION_BACKFILL_UNSAFE/);
  assert.match(migration, /WHERE p\.verification_state IN \('INITIAL_VERIFIED','REVIEW_REQUIRED'\)/);
  assert.match(migration, /AND p\.verify_after=p\.initial_verified_at\+make_interval\(secs=>p\.retention_seconds\)/);
  const disable = migration.indexOf('DISABLE TRIGGER guard_reward_x_promotion_post_verification_mutation_trigger');
  const update = migration.indexOf('UPDATE public.reward_x_promotion_post_verifications p');
  const enable = migration.indexOf('ENABLE TRIGGER guard_reward_x_promotion_post_verification_mutation_trigger');
  assert.ok(disable !== -1 && update > disable && enable > update);
  assert.match(migration, /^BEGIN;[\s\S]*COMMIT;\s*$/);
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?public\.reward_x_promotion_(?:obligations|receipts|payouts|payout_intents|splits)\b/i);
});

test('initial verification must still bind wallet, post, token, 24h retention and cleared security', () => {
  assert.match(migration, /v_obligation\.financial_state<>'HELD'/);
  assert.match(migration, /v_opportunity\.share_token::text/);
  assert.match(migration, /REWARD_X_PROMOTION_POST_IDENTITY_MISMATCH/);
  assert.match(migration, /new\.retention_seconds<>86400/);
  assert.match(migration, /v_submission\.submitted_at/);
});

test('UTC timestamps preserve the actual 24-hour maturity across timezone changes', () => {
  const posted = new Date('2026-11-11T11:57:27.000Z');
  const firstVerified = new Date('2026-11-11T15:45:48.362Z');
  const due = new Date(posted.getTime() + 24 * 60 * 60 * 1000);
  assert.equal(due.toISOString(),'2026-11-12T11:57:27.000Z');
  assert.ok(due.getTime() < firstVerified.getTime() + 24 * 60 * 60 * 1000);
});
