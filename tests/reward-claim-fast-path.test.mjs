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

test('Claim fast preparation fails closed before assigning work when payout safety is unavailable', () => {
  const immediateStart = payoutWrapper.indexOf(
    'export async function runImmediateClaimRewardPayout',
  );
  const immediateEnd = payoutWrapper.indexOf(
    'export async function runAutomaticRewardPayout',
  );
  const immediateFunction = payoutWrapper.slice(
    immediateStart,
    immediateEnd,
  );
  const readinessIndex = immediateFunction.indexOf(
    'const readiness = readBaseReadiness()',
  );
  const prepareIndex = immediateFunction.indexOf(
    'await prepareClaimedRewardFastPath',
  );

  assert.ok(readinessIndex >= 0);
  assert.ok(prepareIndex > readinessIndex);
  assert.match(immediateFunction, /!readiness\.enabled/);
  assert.match(immediateFunction, /!readiness\.configured/);
  assert.match(immediateFunction, /!readiness\.distributorAddress/);

  const runtimeIndex = fastPath.indexOf(
    'readRewardRuntimeSafety()',
  );
  const emergencyPauseIndex = fastPath.indexOf(
    'runtime.emergencyRewardsPaused',
  );
  const poolPauseIndex = fastPath.indexOf(
    'pool.distributionPaused',
  );
  const distributorIndex = fastPath.indexOf(
    'pool.rewardDistributors.includes',
  );
  const batchIndex = fastPath.indexOf(
    "'prepare_predictive_reward_batch'",
  );

  assert.ok(runtimeIndex >= 0);
  assert.ok(emergencyPauseIndex > runtimeIndex);
  assert.ok(poolPauseIndex > runtimeIndex);
  assert.ok(distributorIndex > runtimeIndex);
  assert.ok(batchIndex > emergencyPauseIndex);
  assert.ok(batchIndex > poolPauseIndex);
  assert.ok(batchIndex > distributorIndex);
  assert.match(fastPath, /MAINNET_FUNDED_REWARDS_DISABLED/);
  assert.match(fastPath, /REWARD_DISTRIBUTION_PAUSED/);
  assert.match(fastPath, /DISTRIBUTOR_ADMIN_CONFLICT/);
  assert.match(fastPath, /DISTRIBUTOR_NOT_REGISTERED/);
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
