import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const recovery = readFileSync(
  new URL('../src/lib/rewards/submittedPayoutRecovery.ts', import.meta.url),
  'utf8',
);
const retryRoute = readFileSync(
  new URL('../src/app/api/rewards/reservations/retry/route.ts', import.meta.url),
  'utf8',
);
const manifestMigration = readFileSync(
  new URL('../supabase/migrations/20260914133500_allow_reward_payout_manifest_v3.sql', import.meta.url),
  'utf8',
);

test('submitted payout recovery can only verify and finalize existing transactions', () => {
  assert.match(recovery, /recoverSubmittedRewardPayout/u);
  assert.match(recovery, /reward_payout_transaction_submissions/u);
  assert.match(recovery, /reward_payout_signed_transactions/u);
  assert.match(recovery, /verifyFinalizedRewardTransactionOnChain/u);
  assert.match(recovery, /finalize_reward_payout_manifest/u);
  assert.match(recovery, /TX_NOT_FINALIZED/u);

  assert.doesNotMatch(recovery, /signAndJournalTransaction/u);
  assert.doesNotMatch(recovery, /sendTransaction/u);
  assert.doesNotMatch(recovery, /buildTransactionBody/u);
  assert.doesNotMatch(recovery, /create_reward_payout_manifest/u);
  assert.doesNotMatch(recovery, /prepare_predictive_reward_batch/u);
  assert.doesNotMatch(recovery, /reserveEligibleReferralRewards/u);
});

test('authenticated retry path advances a pending submitted payout after finality', () => {
  assert.match(retryRoute, /requireWalletSession/u);
  assert.match(retryRoute, /sameOrigin/u);
  assert.match(retryRoute, /hasPendingOwnPayout/u);
  assert.match(retryRoute, /recoverSubmittedRewardPayout/u);
  assert.match(retryRoute, /pendingPayoutBefore/u);
  assert.match(retryRoute, /pendingPayoutAfter/u);
  assert.match(retryRoute, /payoutRecoveryStatus/u);
});

test('schema permits both legacy v2 and proof-aware v3 payout manifests', () => {
  assert.match(
    manifestMigration,
    /reward_payout_manifests_version_check/u,
  );
  assert.match(
    manifestMigration,
    /veinvite-payout-manifest-v2/u,
  );
  assert.match(
    manifestMigration,
    /veinvite-payout-manifest-v3/u,
  );
});
