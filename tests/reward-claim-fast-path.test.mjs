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
const basePayoutWorker = readFileSync(
  new URL('../src/lib/rewards/automaticRewardPayout.ts', import.meta.url),
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
  assert.match(immediateFunction, /runClaimTransferWorker/);
  assert.doesNotMatch(
    immediateFunction,
    /reserveEligibleReferralRewards/,
  );
  assert.doesNotMatch(
    immediateFunction,
    /falling back to the standard payout worker/i,
  );
});

test('Claim transfer worker cannot create a generic Sybil-planned reward round', () => {
  assert.match(
    payoutWrapper,
    /runBaseAutomaticRewardPayout\(\{[\s\S]*allowGeneralRoundPreparation:\s*false,[\s\S]*\}\)/,
  );

  const workerStart = basePayoutWorker.indexOf(
    'export async function runAutomaticRewardPayout',
  );
  assert.ok(workerStart >= 0);
  const worker = basePayoutWorker.slice(workerStart);
  const guardIndex = worker.indexOf(
    'if (!allowGeneralRoundPreparation)',
  );
  const genericPrepareIndex = worker.indexOf(
    'await prepareRewardRound({',
  );

  assert.ok(guardIndex >= 0);
  assert.ok(genericPrepareIndex > guardIndex);
  assert.match(
    worker,
    /Claim transfer-only worker found no active claimed payout round/,
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

  const poolReadIndex = fastPath.indexOf(
    'readVeInviteRewardPoolStatus()',
  );
  const fundedIndex = fastPath.indexOf(
    'pool.mainnetFundedRewardsEnabled',
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

  assert.ok(poolReadIndex >= 0);
  assert.ok(fundedIndex > poolReadIndex);
  assert.ok(poolPauseIndex > poolReadIndex);
  assert.ok(distributorIndex > poolReadIndex);
  assert.ok(batchIndex > fundedIndex);
  assert.ok(batchIndex > poolPauseIndex);
  assert.ok(batchIndex > distributorIndex);
  assert.doesNotMatch(
    fastPath,
    /readRewardRuntimeSafety/,
  );
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
  assert.doesNotMatch(
    standardFunction,
    /allowGeneralRoundPreparation:\s*false/,
  );
});


test('Claim transfer path reuses checkpoint state without a full reward-state reload', () => {
  const workerStart = basePayoutWorker.indexOf(
    'export async function runAutomaticRewardPayout',
  );
  const worker = basePayoutWorker.slice(workerStart);
  const checkpointStart = worker.indexOf(
    'if (!state.checkpoint)',
  );
  const checkpointEnd = worker.indexOf(
    'const manifest = rebuildManifest',
    checkpointStart,
  );
  const checkpointBlock = worker.slice(
    checkpointStart,
    checkpointEnd,
  );

  assert.match(
    checkpointBlock,
    /checkpoint:\s*await ensureCheckpoint\(manifestId\)/,
  );
  assert.doesNotMatch(
    checkpointBlock,
    /loadActiveRewardState/,
  );
});

test('fresh payout broadcast skips only the redundant existence lookup', () => {
  assert.match(
    basePayoutWorker,
    /checkExisting = true/,
  );
  assert.match(
    basePayoutWorker,
    /if \(checkExisting\)[\s\S]*getTransaction\(txId\)/,
  );
  assert.match(
    basePayoutWorker,
    /await broadcastSignedTransaction\(\{[\s\S]*\.\.\.signed,[\s\S]*checkExisting: false,[\s\S]*\}\)/,
  );
  assert.match(
    basePayoutWorker,
    /Automatic reward rebroadcast failed:/,
  );
});
