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
const baseWorker = await readFile(
  new URL(
    '../src/lib/rewards/automaticRewardPayout.ts',
    import.meta.url,
  ),
  'utf8',
);
const verifier = await readFile(
  new URL('../src/lib/rewards/transactionVerificationLegacy.ts', import.meta.url),
  'utf8',
);
const versionedVerifier = await readFile(
  new URL('../src/lib/rewards/transactionVerification.ts', import.meta.url),
  'utf8',
);

test('broadcast confirmation is separate from PAID settlement', () => {
  assert.match(
    migration,
    /add column if not exists broadcast_confirmed_at timestamptz/i,
  );
  assert.match(
    migration,
    /all broadcast-confirmed manifest payouts must remain PENDING with no tx_id/i,
  );
  assert.doesNotMatch(
    migration,
    /update\s+public\.reward_payouts[\s\S]{0,240}status\s*=\s*'PAID'/i,
  );
  assert.doesNotMatch(
    migration,
    /update\s+public\.invitations[\s\S]{0,240}reward_status\s*=\s*'PAID'/i,
  );

  assert.match(
    recovery,
    /verifyFinalizedRewardTransactionOnChain\(/,
  );
  assert.match(
    recovery,
    /finalize_reward_payout_manifest/,
  );
  assert.match(
    verifier,
    /evidence\.blockNumber\s*>\s*evidence\.finalizedHeadNumber/,
  );
});

test('canonical broadcast requires the same immutable B3TR event proof as final PAID settlement', () => {
  assert.match(
    recovery,
    /observeCanonicalSuccessfulReceipt[\s\S]*verifyCanonicalRewardTransactionOnChain/,
  );
  assert.match(
    recovery,
    /error\.code === 'TX_NOT_FINALIZED'[\s\S]{0,900}observeCanonicalSuccessfulReceipt\([\s\S]{0,500}markBroadcastConfirmed\(manifestId, txId\)/,
  );
  assert.match(
    recovery,
    /expectedOperator: configuredDistributor,[\s\S]*manifest,[\s\S]*manifestCreatedAt/,
  );
  assert.match(
    versionedVerifier,
    /verifyCanonicalRewardTransactionOnChain[\s\S]*loadCanonicalRewardTransactionEvidence[\s\S]*requireFinality: false/,
  );
  assert.match(
    versionedVerifier,
    /sanitizeStructuredProofsForLegacyVerifier/,
  );
  assert.match(
    verifier,
    /requireFinality &&[\s\S]*evidence\.blockNumber >[\s\S]*evidence\.finalizedHeadNumber/,
  );
  assert.match(
    verifier,
    /requireFinality &&[\s\S]*receipt\.blockNumber >[\s\S]*finalizedHead\.number/,
  );
  assert.match(verifier, /actual\.data !== expected\.data\.toLowerCase\(\)/);
  assert.match(verifier, /rewardEvent\.receiver !==[\s\S]*expectedClause\.recipientWallet/);
  assert.match(verifier, /rewardEvent\.amountWei !==[\s\S]*expectedClause\.amountWei/);
  assert.match(verifier, /rewardEvent\.distributor !==[\s\S]*normalizedOperator/);
  assert.match(recovery, /error\.code === 'TX_NOT_FOUND'/);
  assert.match(recovery, /error\.code === 'TX_RECEIPT_NOT_FOUND'/);
  assert.match(
    recovery,
    /await markBroadcastConfirmed\(manifestId, txId\)/,
  );
  assert.match(
    migration,
    /status = any \(array\['CREATED'::text, 'PAYING'::text\]\)[\s\S]{0,100}broadcast_confirmed_at is null/i,
  );
});

test('broadcast marker is bound to immutable journal and remains server-only', () => {
  assert.match(
    migration,
    /v_submission\.manifest_hash <> v_manifest\.manifest_hash/,
  );
  assert.match(
    migration,
    /v_signed\.manifest_hash <> v_manifest\.manifest_hash/,
  );
  assert.match(
    migration,
    /v_submission\.tx_id <> p_tx_id/,
  );
  assert.match(
    migration,
    /v_signed\.tx_id <> p_tx_id/,
  );
  assert.match(
    migration,
    /revoke all on function public\.mark_reward_payout_broadcast_confirmed\(bigint, text\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.mark_reward_payout_broadcast_confirmed\(bigint, text\)[\s\S]*to service_role/i,
  );
});

test('unconfirmed broadcasts are recovered before older confirmed finality work', () => {
  const unconfirmedIndex = recovery.indexOf(
    ".is('broadcast_confirmed_at', null)",
  );
  const fallbackIndex = recovery.indexOf(
    'const fallbackRoundResult',
  );

  assert.ok(unconfirmedIndex >= 0);
  assert.ok(fallbackIndex > unconfirmedIndex);
  assert.match(
    recovery,
    /unconfirmedRoundResult\.data\s*\?\?\s*fallbackRoundResult\?\.data/,
  );
  assert.match(
    recovery,
    /\.is\('broadcast_confirmed_at', null\)[\s\S]*\.order\('id', \{ ascending: true \}\)/,
  );
  assert.match(
    wrapper,
    /await recoverSubmittedBeforePayout\(\);[\s\S]*await prepareClaimedRewardFastPath/,
  );
  assert.match(
    wrapper,
    /await recoverSubmittedBeforePayout\(\);[\s\S]*await reserveEligibleReferralRewards\(\);/,
  );
});

test('broadcast-confirmed rounds do not become active transfer-worker state', () => {
  const activeLoaderStart = baseWorker.indexOf(
    'async function loadActiveRewardState',
  );
  const activeLoaderEnd = baseWorker.indexOf(
    'async function prepareRewardRound',
  );

  assert.ok(activeLoaderStart >= 0);
  assert.ok(activeLoaderEnd > activeLoaderStart);

  const activeLoader = baseWorker.slice(
    activeLoaderStart,
    activeLoaderEnd,
  );

  assert.match(
    activeLoader,
    /\.in\('status', \['CREATED', 'PAYING'\]\)[\s\S]*\.is\('broadcast_confirmed_at', null\)/,
  );
});

test('fixed reservation and Sybil eligibility gates remain in cohort preparation', () => {
  assert.match(
    migration,
    /q\.reserved_amount_wei is not null and q\.reserved_amount_wei > 0/i,
  );
  assert.match(
    migration,
    /i\.status = 'COMPLETED' and i\.reward_status = 'ELIGIBLE'/i,
  );
  assert.match(
    migration,
    /i\.sybil_status = 'CLEAR'/i,
  );
  assert.match(
    migration,
    /not exists \([\s\S]{0,180}public\.reward_payouts rp where rp\.invite_code = q\.invite_code/i,
  );
  assert.match(
    migration,
    /v_reserved_existing > p_pool_balance_wei/i,
  );
});
