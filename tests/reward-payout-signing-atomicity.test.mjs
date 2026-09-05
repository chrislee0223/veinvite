import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20260905093000_make_reward_payout_signing_atomic.sql',
    import.meta.url,
  ),
  'utf8',
);

test('signed payout transaction registration also journals submission atomically', () => {
  const submissionCalls = migration.match(
    /perform public\.register_reward_payout_transaction_submission\(/g,
  ) ?? [];

  assert.equal(
    submissionCalls.length,
    2,
    'both exact-retry and new-signed-transaction paths must create the submission record',
  );

  assert.match(
    migration,
    /insert into public\.reward_payout_signed_transactions[\s\S]*perform public\.register_reward_payout_transaction_submission\(/,
  );
});

test('exact signed-transaction retries repair a missing submission without resigning', () => {
  assert.match(
    migration,
    /if found then[\s\S]*v_existing\.tx_id = p_tx_id[\s\S]*v_existing\.raw_tx_hex = p_raw_tx_hex[\s\S]*perform public\.register_reward_payout_transaction_submission\([\s\S]*'created', false/,
  );
  assert.match(
    migration,
    /reward payout manifest already has a different signed transaction/,
  );
});

test('signed payout journal remains server-only', () => {
  assert.match(
    migration,
    /security definer[\s\S]*set search_path to 'public'/,
  );
  assert.match(
    migration,
    /revoke execute on function public\.register_reward_payout_signed_transaction\(bigint,text,text,text\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.register_reward_payout_signed_transaction\(bigint,text,text,text\)[\s\S]*to service_role/,
  );
});
