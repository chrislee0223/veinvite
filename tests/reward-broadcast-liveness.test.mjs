import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20260914163458_decouple_confirmed_reward_broadcasts.sql',
    import.meta.url,
  ),
  'utf8',
);
const recovery = await readFile(
  new URL('../src/lib/rewards/submittedPayoutRecovery.ts', import.meta.url),
  'utf8',
);
const wrapper = await readFile(
  new URL(
    '../src/lib/rewards/automaticRewardPayoutWithMnemonic.ts',
    import.meta.url,
  ),
  'utf8',
);
const verifier = await readFile(
  new URL('../src/lib/rewards/transactionVerificationLegacy.ts', import.meta.url),
  'utf8',
);

test('broadcast confirmation is separate from PAID settlement', () => {
  assert.match(migration, /add column if not exists broadcast_confirmed_at timestamptz/i);
  assert.match(migration, /all broadcast-confirmed manifest payouts must remain PENDING with no tx_id/i);
  assert.doesNotMatch(migration, /update\s+public\.reward_payouts[\s\S]{0,240}status\s*=\s*'PAID'/i);
  assert.doesNotMatch(migration, /update\s+public\.invitations[\s\S]{0,240}reward_status\s*=\s*'PAID'/i);
  assert.match(recovery, /verifyFinalizedRewardTransactionOnChain\(/);
  assert.match(recovery, /finalize_reward_payout_manifest/);
  assert.match(verifier, /evidence\.blockNumber\s*>\s*evidence\.finalizedHeadNumber/);
});

test('only a canonical successful receipt can release the next-batch gate', () => {
  assert.match(recovery, /error\.code === 'TX_NOT_FINALIZED'[\s\S]{0,900}observeCanonicalSuccessfulReceipt\([\s\S]{0,350}markBroadcastConfirmed\(manifestId, txId\)/);
  assert.match(recovery, /receipt\.reverted !== false[\s\S]{0,220}cannot release the next reward batch/);
  assert.match(recovery, /canonicalId === blockId[\s\S]{0,100}isTrunk !== false/);
  assert.match(recovery, /transactionOrigin !== expectedOperator[\s\S]{0,120}receiptOrigin !== expectedOperator/);
  assert.match(recovery, /error\.code === 'TX_NOT_FOUND'[\s\S]{0,180}error\.code === 'TX_RECEIPT_NOT_FOUND'/);
  const notFoundBranch = recovery.match(/error\.code === 'TX_NOT_FOUND'[\s\S]*?return \{[\s\S]*?status: 'WAITING_FINALITY'[\s\S]*?\};/)?.[0] ?? '';
  assert.doesNotMatch(notFoundBranch, /markBroadcastConfirmed/);
  assert.match(migration, /status = any \(array\['CREATED'::text, 'PAYING'::text\]\)[\s\S]{0,100}broadcast_confirmed_at is null/i);
  assert.match(migration, /rr\.status in \('CREATED','PAYING'\)[\s\S]{0,100}rr\.broadcast_confirmed_at is null/i);
});

test('broadcast marker is bound to immutable journal and remains server-only', () => {
  assert.match(migration, /v_submission\.manifest_hash <> v_manifest\.manifest_hash/);
  assert.match(migration, /v_signed\.manifest_hash <> v_manifest\.manifest_hash/);
  assert.match(migration, /v_submission\.tx_id <> p_tx_id/);
  assert.match(migration, /v_signed\.tx_id <> p_tx_id/);
  assert.match(migration, /revoke all on function public\.mark_reward_payout_broadcast_confirmed\(bigint, text\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.mark_reward_payout_broadcast_confirmed\(bigint, text\)[\s\S]*to service_role/i);
});

test('confirmed older submissions are recovered oldest-first while claim work can continue', () => {
  assert.match(recovery, /\.order\('id', \{ ascending: true \}\)/);
  assert.match(wrapper, /await recoverSubmittedBeforePayout\(\);[\s\S]*await prepareClaimedRewardFastPath/);
  assert.match(wrapper, /await recoverSubmittedBeforePayout\(\);[\s\S]*await reserveEligibleReferralRewards\(\);/);
});

test('fixed reservation and Sybil eligibility gates remain in cohort preparation', () => {
  assert.match(migration, /q\.reserved_amount_wei is not null and q\.reserved_amount_wei > 0/i);
  assert.match(migration, /i\.status = 'COMPLETED' and i\.reward_status = 'ELIGIBLE'/i);
  assert.match(migration, /i\.sybil_status = 'CLEAR'/i);
  assert.match(migration, /not exists \([\s\S]{0,180}public\.reward_payouts rp where rp\.invite_code = q\.invite_code/i);
  assert.match(migration, /v_reserved_existing > p_pool_balance_wei/i);
});
