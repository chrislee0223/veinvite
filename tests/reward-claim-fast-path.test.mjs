import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const claimRoute = readFileSync(
  new URL('../src/app/api/rewards/claims/route.ts', import.meta.url),
  'utf8',
);
const payoutWrapper = readFileSync(
  new URL('../src/lib/rewards/automaticRewardPayoutWithMnemonic.ts', import.meta.url),
  'utf8',
);
const fastPath = readFileSync(
  new URL('../src/lib/rewards/immediateClaimPayout.ts', import.meta.url),
  'utf8',
);

test('explicit Claim uses the reserved payout fast path', () => {
  assert.match(claimRoute, /runImmediateClaimRewardPayout/);
  assert.match(claimRoute, /request_reward_claim/);

  const start = payoutWrapper.indexOf(
    'export async function runImmediateClaimRewardPayout',
  );
  const end = payoutWrapper.indexOf(
    'export async function runAutomaticRewardPayout',
  );

  assert.ok(start >= 0 && end > start);

  const immediateFunction = payoutWrapper.slice(start, end);

  assert.match(immediateFunction, /prepareClaimedRewardFastPath/);
  assert.match(immediateFunction, /runBaseAutomaticRewardPayout/);
  assert.doesNotMatch(
    immediateFunction,
    /reserveEligibleReferralRewards/,
  );
});

test('Claim preparation reuses fixed reservations without background re-verification sweeps', () => {
  assert.match(fastPath, /prepare_predictive_reward_batch/);
  assert.match(fastPath, /EXPLICIT_CLAIM_FAST_PATH/);
  assert.match(fastPath, /reservedOnly: true/);
  assert.doesNotMatch(
    fastPath,
    /reserveEligibleReferralRewards|syncVeInviteAllocationReceipts|refreshQueuedReferralSignalChecks|readPredictiveRewardPlanning/,
  );
});

test('standard automatic payout keeps offline reservation behavior unchanged', () => {
  const start = payoutWrapper.indexOf(
    'export async function runAutomaticRewardPayout',
  );

  assert.ok(start >= 0);

  const standardFunction = payoutWrapper.slice(start);

  assert.match(
    standardFunction,
    /reserveEligibleReferralRewards\(\)/,
  );
  assert.match(
    standardFunction,
    /runBaseAutomaticRewardPayout\(\)/,
  );
});
