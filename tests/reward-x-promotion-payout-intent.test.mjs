import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009154500_add_x_promotion_payout_intent_foundation_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('payout intent foundation requires X promotion LIVE to remain disabled during migration', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_PAYOUT_INTENT_FOUNDATION_REQUIRES_LIVE_DISABLED/,
  );
});

test('one immutable payout intent is bound to one obligation, verification, split and invite', () => {
  assert.match(migration, /unique\(obligation_id\)/);
  assert.match(migration, /unique\(verification_id\)/);
  assert.match(migration, /unique\(split_id\)/);
  assert.match(migration, /unique\(invite_code\)/);
  assert.match(
    migration,
    /before update or delete on public\.reward_x_promotion_payout_intents/,
  );
});

test('intent amount and identity are revalidated against the HELD obligation', () => {
  assert.match(migration, /v_obligation\.financial_state<>'HELD'/);
  assert.match(
    migration,
    /v_obligation\.promotion_amount_wei<>new\.amount_wei/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_PAYOUT_INTENT_OBLIGATION_MISMATCH/,
  );
});

test('intent requires FINAL_VERIFIED exact X post identity', () => {
  assert.match(
    migration,
    /v_verification\.verification_state<>'FINAL_VERIFIED'/,
  );
  assert.match(
    migration,
    /v_verification\.x_post_id<>new\.x_post_id/,
  );
  assert.match(
    migration,
    /v_verification\.x_author_id<>new\.x_author_id/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_PAYOUT_INTENT_VERIFICATION_MISMATCH/,
  );
});

test('intent creation rechecks current Sybil safety and uses the per-invite lock', () => {
  assert.match(
    migration,
    /veinvite_x_promotion_' \|\| new\.invite_code/,
  );
  assert.match(
    migration,
    /is_sybil_v2_referral_invalidated\(new\.invite_code,new\.network\)/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_PAYOUT_INTENT_SECURITY_NOT_CLEAR/,
  );
});

test('foundation does not add signing, broadcast, settlement or PAID transition', () => {
  const executableMigration = migration.replace(/^--.*$/gmu, '');
  assert.doesNotMatch(executableMigration, /raw_tx_hex/i);
  assert.doesNotMatch(executableMigration, /broadcast/i);
  assert.doesNotMatch(executableMigration, /transaction_settlement/i);
  assert.doesNotMatch(executableMigration, /financial_state\s*=\s*'PAID'/i);
});

test('intent table is server-only and direct service-role INSERT is not granted', () => {
  assert.match(
    migration,
    /alter table public\.reward_x_promotion_payout_intents enable row level security/,
  );
  assert.match(
    migration,
    /grant select on table public\.reward_x_promotion_payout_intents to service_role/,
  );
  assert.doesNotMatch(
    migration,
    /grant\s+[^;]*insert[^;]*reward_x_promotion_payout_intents/i,
  );
});
