export const PREDICTIVE_REWARD_ALGORITHM_VERSION =
  'predictive-reserve-v2-cohort';

const BPS = 10_000;
const STRESS_GROWTH_BPS = 12_500;
const MIN_STRESS_RECIPIENTS = 4;
const STRESS_EXTRA_RECIPIENTS = 2;

export type RewardPipelineSnapshot = {
  queuedEligibleCount: number;
  voteReadyCount: number;
  vot3ReadyCount: number;
  appsTwoCount: number;
  appsOneCount: number;
  activatedZeroCount: number;
  pendingAcceptanceCount: number;
};

export type PredictiveRewardPolicy = {
  algorithmVersion: string;
  pipeline: RewardPipelineSnapshot;
  expectedCompletions: number;
  stressCompletions: number;
  latestAllocationWei: string;
  fundingAdjustmentWei: string;
  designatedBudgetWei: string;
  cohortReservedWei: string;
  cohortAvailableBudgetWei: string;
  observedPoolBalanceWei: string;
  reservedExistingWei: string;
  availablePoolWei: string;
  pricingBasisWei: string;
  rewardPerInviteWei: string;
  maxImmediatelyPayableCount: string;
  projectedReserveAfterExpectedWei: string;
  projectedReserveAfterStressWei: string;
};

const EXPECTED_WEIGHTS_BPS: Record<keyof RewardPipelineSnapshot, number> = {
  queuedEligibleCount: 10_000,
  voteReadyCount: 9_500,
  vot3ReadyCount: 8_000,
  appsTwoCount: 6_000,
  appsOneCount: 4_000,
  activatedZeroCount: 2_500,
  pendingAcceptanceCount: 500,
};

const STRESS_WEIGHTS_BPS: Record<keyof RewardPipelineSnapshot, number> = {
  queuedEligibleCount: 10_000,
  voteReadyCount: 10_000,
  vot3ReadyCount: 9_500,
  appsTwoCount: 8_000,
  appsOneCount: 6_000,
  activatedZeroCount: 4_500,
  pendingAcceptanceCount: 1_000,
};

function parseWei(value: string, fieldName: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldName} must be a non-negative integer string.`);
  }

  return BigInt(value);
}

function normalizeCount(value: number, fieldName: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative safe integer.`);
  }

  return value;
}

function normalizePipeline(
  pipeline: RewardPipelineSnapshot,
): RewardPipelineSnapshot {
  return {
    queuedEligibleCount: normalizeCount(
      pipeline.queuedEligibleCount,
      'queuedEligibleCount',
    ),
    voteReadyCount: normalizeCount(
      pipeline.voteReadyCount,
      'voteReadyCount',
    ),
    vot3ReadyCount: normalizeCount(
      pipeline.vot3ReadyCount,
      'vot3ReadyCount',
    ),
    appsTwoCount: normalizeCount(
      pipeline.appsTwoCount,
      'appsTwoCount',
    ),
    appsOneCount: normalizeCount(
      pipeline.appsOneCount,
      'appsOneCount',
    ),
    activatedZeroCount: normalizeCount(
      pipeline.activatedZeroCount,
      'activatedZeroCount',
    ),
    pendingAcceptanceCount: normalizeCount(
      pipeline.pendingAcceptanceCount,
      'pendingAcceptanceCount',
    ),
  };
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error('denominator must be positive.');
  }

  if (numerator <= 0n) {
    return 0n;
  }

  return (numerator + denominator - 1n) / denominator;
}

function weightedBps(
  pipeline: RewardPipelineSnapshot,
  weights: Record<keyof RewardPipelineSnapshot, number>,
): bigint {
  let total = 0n;

  for (const key of Object.keys(pipeline) as Array<
    keyof RewardPipelineSnapshot
  >) {
    total += BigInt(pipeline[key]) * BigInt(weights[key]);
  }

  return total;
}

function safeNumber(value: bigint, fieldName: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} exceeds the safe integer range.`);
  }

  return Number(value);
}

/**
 * Prices a fixed completion-time referral reservation from the funding that was
 * explicitly designated to that participant cohort. Official allocation and
 * auditable cohort adjustments (for example a one-off promotion) may fund the
 * cohort; unrelated carry-over or another cohort's allocation may not.
 *
 * The global pool balance remains a hard physical-cap check, while the cohort
 * budget is a second logical cap. Stress completion weighting deliberately
 * keeps actual fixed reservations conservative even when the public midpoint
 * estimate is higher.
 */
export function calculatePredictiveRewardPolicy(input: {
  latestAllocationWei: string;
  fundingAdjustmentWei: string;
  cohortReservedWei: string;
  observedPoolBalanceWei: string;
  reservedExistingWei: string;
  pipeline: RewardPipelineSnapshot;
}): PredictiveRewardPolicy {
  const latestAllocation = parseWei(
    input.latestAllocationWei,
    'latestAllocationWei',
  );
  const fundingAdjustment = parseWei(
    input.fundingAdjustmentWei,
    'fundingAdjustmentWei',
  );
  const cohortReserved = parseWei(
    input.cohortReservedWei,
    'cohortReservedWei',
  );
  const observedPoolBalance = parseWei(
    input.observedPoolBalanceWei,
    'observedPoolBalanceWei',
  );
  const reservedExisting = parseWei(
    input.reservedExistingWei,
    'reservedExistingWei',
  );
  const pipeline = normalizePipeline(input.pipeline);

  const designatedBudget = latestAllocation + fundingAdjustment;
  const cohortAvailableBudget =
    designatedBudget > cohortReserved
      ? designatedBudget - cohortReserved
      : 0n;
  const availablePool =
    observedPoolBalance > reservedExisting
      ? observedPoolBalance - reservedExisting
      : 0n;
  const pricingBasis =
    cohortAvailableBudget < availablePool
      ? cohortAvailableBudget
      : availablePool;

  const expectedWeighted = weightedBps(
    pipeline,
    EXPECTED_WEIGHTS_BPS,
  );
  const stressWeighted = weightedBps(
    pipeline,
    STRESS_WEIGHTS_BPS,
  );

  const expectedBase = ceilDiv(
    expectedWeighted,
    BigInt(BPS),
  );
  const stressWithGrowth = ceilDiv(
    stressWeighted * BigInt(STRESS_GROWTH_BPS),
    BigInt(BPS) * BigInt(BPS),
  );

  const queued = BigInt(pipeline.queuedEligibleCount);
  const expectedCompletionsBig =
    expectedBase > queued ? expectedBase : queued;
  const stressBase =
    stressWithGrowth + BigInt(STRESS_EXTRA_RECIPIENTS);
  const stressCompletionsBig = [
    BigInt(MIN_STRESS_RECIPIENTS),
    queued,
    expectedCompletionsBig,
    stressBase,
  ].reduce((highest, value) =>
    value > highest ? value : highest,
  0n);

  const rewardPerInvite =
    pricingBasis > 0n && stressCompletionsBig > 0n
      ? pricingBasis / stressCompletionsBig
      : 0n;

  const maxImmediatelyPayableCount =
    rewardPerInvite > 0n
      ? pricingBasis / rewardPerInvite
      : 0n;

  const expectedSpend =
    rewardPerInvite * expectedCompletionsBig;
  const stressSpend =
    rewardPerInvite * stressCompletionsBig;

  return {
    algorithmVersion:
      PREDICTIVE_REWARD_ALGORITHM_VERSION,
    pipeline,
    expectedCompletions: safeNumber(
      expectedCompletionsBig,
      'expectedCompletions',
    ),
    stressCompletions: safeNumber(
      stressCompletionsBig,
      'stressCompletions',
    ),
    latestAllocationWei: latestAllocation.toString(),
    fundingAdjustmentWei: fundingAdjustment.toString(),
    designatedBudgetWei: designatedBudget.toString(),
    cohortReservedWei: cohortReserved.toString(),
    cohortAvailableBudgetWei: cohortAvailableBudget.toString(),
    observedPoolBalanceWei:
      observedPoolBalance.toString(),
    reservedExistingWei: reservedExisting.toString(),
    availablePoolWei: availablePool.toString(),
    pricingBasisWei: pricingBasis.toString(),
    rewardPerInviteWei: rewardPerInvite.toString(),
    maxImmediatelyPayableCount:
      maxImmediatelyPayableCount.toString(),
    projectedReserveAfterExpectedWei:
      (cohortAvailableBudget > expectedSpend
        ? cohortAvailableBudget - expectedSpend
        : 0n
      ).toString(),
    projectedReserveAfterStressWei:
      (cohortAvailableBudget > stressSpend
        ? cohortAvailableBudget - stressSpend
        : 0n
      ).toString(),
  };
}
