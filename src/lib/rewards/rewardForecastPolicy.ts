export const REWARD_FORECAST_MODEL_VERSION = 'reward-forecast-v1';

const BPS = 10_000n;
const BOOTSTRAP_BASE_RECIPIENTS = 6;
const BOOTSTRAP_LOW_RECIPIENTS = 4;
const BOOTSTRAP_HIGH_RECIPIENTS = 8;
const STARTING_USER_COUNT = 1;
const FUTURE_ENTRY_BASE = 2;
const FUTURE_ENTRY_STRESS = 3;

export type RewardForecastPipeline = {
  queuedEligibleCount: number;
  voteReadyCount: number;
  vot3ReadyCount: number;
  appsTwoCount: number;
  appsOneCount: number;
  activatedZeroCount: number;
  pendingAcceptanceExpectedBps: number;
  pendingAcceptanceStressBps: number;
};

export type RewardForecastPolicy = {
  modelVersion: string;
  projectedAllocationWei: string;
  projectedAllocationLowWei: string;
  projectedAllocationHighWei: string;
  allocationSampleCount: number;
  recipientHistoryRoundCount: number;
  expectedRecipients: number;
  recipientLow: number;
  recipientHigh: number;
  estimatedRewardWei: string;
  estimatedRewardLowWei: string;
  estimatedRewardHighWei: string;
  pricingCapacityWei: string;
  pipelineExpectedRecipients: number;
  pipelineStressRecipients: number;
};

const EXPECTED_WEIGHTS_BPS = {
  queuedEligibleCount: 10_000,
  voteReadyCount: 9_500,
  vot3ReadyCount: 8_000,
  appsTwoCount: 6_000,
  appsOneCount: 4_000,
  activatedZeroCount: 2_500,
} as const;

const STRESS_WEIGHTS_BPS = {
  queuedEligibleCount: 10_000,
  voteReadyCount: 10_000,
  vot3ReadyCount: 9_500,
  appsTwoCount: 8_000,
  appsOneCount: 6_000,
  activatedZeroCount: 4_500,
} as const;

function parseWei(value: string, fieldName: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldName} must be a non-negative integer string.`);
  }

  return BigInt(value);
}

function safeCount(value: number, fieldName: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative safe integer.`);
  }

  return value;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('denominator must be positive.');
  if (numerator <= 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

function clampBigInt(value: bigint, low: bigint, high: bigint): bigint {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

function toSafeNumber(value: bigint, fieldName: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} exceeds the safe integer range.`);
  }
  return Number(value);
}

function weightedAllocationAverage(valuesNewestFirst: bigint[]): bigint {
  if (valuesNewestFirst.length === 0) return 0n;

  const chronological = [...valuesNewestFirst].reverse();
  let weighted = 0n;
  let weightTotal = 0n;

  chronological.forEach((value, index) => {
    const weight = BigInt(index + 1);
    weighted += value * weight;
    weightTotal += weight;
  });

  return weightTotal > 0n ? weighted / weightTotal : 0n;
}

function allocationRange(base: bigint, sampleCount: number): {
  low: bigint;
  high: bigint;
} {
  const uncertaintyBps = sampleCount >= 6
    ? 1_000n
    : sampleCount >= 3
      ? 1_500n
      : 2_500n;

  const low = base * (BPS - uncertaintyBps) / BPS;
  const high = ceilDiv(base * (BPS + uncertaintyBps), BPS);

  return { low, high };
}

function pipelineWeightedBps(
  pipeline: RewardForecastPipeline,
  weights: typeof EXPECTED_WEIGHTS_BPS | typeof STRESS_WEIGHTS_BPS,
  pendingBps: number,
): bigint {
  let total = BigInt(safeCount(pendingBps, 'pendingAcceptanceBps'));

  for (const key of Object.keys(weights) as Array<keyof typeof weights>) {
    total += BigInt(safeCount(pipeline[key], String(key))) * BigInt(weights[key]);
  }

  return total;
}

function historicalRecipientAverage(recipientHistory: number[]): number | null {
  if (recipientHistory.length === 0) return null;

  const normalized = recipientHistory.map((value, index) =>
    safeCount(value, `recipientHistory[${index}]`),
  );
  const total = normalized.reduce((sum, value) => sum + value, 0);
  return Math.max(1, Math.round(total / normalized.length));
}

function blendBootstrapWithHistory(historyAverage: number | null, historyCount: number): number {
  if (historyAverage === null || historyCount <= 0) {
    return BOOTSTRAP_BASE_RECIPIENTS;
  }

  const learnedWeightBps = Math.min(7_500, historyCount * 1_250);
  const bootstrapWeightBps = 10_000 - learnedWeightBps;

  return Math.max(
    1,
    Math.round(
      (BOOTSTRAP_BASE_RECIPIENTS * bootstrapWeightBps +
        historyAverage * learnedWeightBps) /
        10_000,
    ),
  );
}

/**
 * Public display forecast only. This model intentionally does not participate
 * in reward preparation, signing, settlement, or payout authorization.
 *
 * It projects the next funded VeBetter round, assumes a user starting now must
 * still finish the governance-vote mission, and therefore prices against the
 * earliest following completion round. Historical allocations and actual
 * recipient counts gradually replace bootstrap assumptions as samples accrue.
 */
export function calculateRewardForecastPolicy(input: {
  recentAllocationWeiNewestFirst: string[];
  observedPoolBalanceWei: string;
  reservedExistingWei: string;
  pipeline: RewardForecastPipeline;
  completedRewardRoundRecipientCounts: number[];
}): RewardForecastPolicy {
  if (input.recentAllocationWeiNewestFirst.length === 0) {
    throw new Error('At least one real allocation sample is required.');
  }

  const allocations = input.recentAllocationWeiNewestFirst.map((value, index) =>
    parseWei(value, `recentAllocationWeiNewestFirst[${index}]`),
  );
  const observedPoolBalance = parseWei(
    input.observedPoolBalanceWei,
    'observedPoolBalanceWei',
  );
  const reservedExisting = parseWei(
    input.reservedExistingWei,
    'reservedExistingWei',
  );

  const pipeline: RewardForecastPipeline = {
    queuedEligibleCount: safeCount(input.pipeline.queuedEligibleCount, 'queuedEligibleCount'),
    voteReadyCount: safeCount(input.pipeline.voteReadyCount, 'voteReadyCount'),
    vot3ReadyCount: safeCount(input.pipeline.vot3ReadyCount, 'vot3ReadyCount'),
    appsTwoCount: safeCount(input.pipeline.appsTwoCount, 'appsTwoCount'),
    appsOneCount: safeCount(input.pipeline.appsOneCount, 'appsOneCount'),
    activatedZeroCount: safeCount(input.pipeline.activatedZeroCount, 'activatedZeroCount'),
    pendingAcceptanceExpectedBps: safeCount(
      input.pipeline.pendingAcceptanceExpectedBps,
      'pendingAcceptanceExpectedBps',
    ),
    pendingAcceptanceStressBps: safeCount(
      input.pipeline.pendingAcceptanceStressBps,
      'pendingAcceptanceStressBps',
    ),
  };

  const projectedAllocation = weightedAllocationAverage(allocations);
  const { low: projectedAllocationLow, high: projectedAllocationHigh } =
    allocationRange(projectedAllocation, allocations.length);

  const expectedWeightedBps = pipelineWeightedBps(
    pipeline,
    EXPECTED_WEIGHTS_BPS,
    pipeline.pendingAcceptanceExpectedBps,
  );
  const stressWeightedBps = pipelineWeightedBps(
    pipeline,
    STRESS_WEIGHTS_BPS,
    pipeline.pendingAcceptanceStressBps,
  );

  const pipelineExpectedRecipients = toSafeNumber(
    ceilDiv(expectedWeightedBps, BPS),
    'pipelineExpectedRecipients',
  );
  const pipelineStressRecipients = toSafeNumber(
    ceilDiv(stressWeightedBps * 12_500n, BPS * BPS),
    'pipelineStressRecipients',
  );

  const recipientHistory = input.completedRewardRoundRecipientCounts.slice(0, 8);
  const historyAverage = historicalRecipientAverage(recipientHistory);
  const learnedBase = blendBootstrapWithHistory(
    historyAverage,
    recipientHistory.length,
  );

  const expectedRecipients = Math.max(
    learnedBase,
    pipelineExpectedRecipients + STARTING_USER_COUNT + FUTURE_ENTRY_BASE,
  );
  const recipientLow = Math.max(
    1,
    Math.min(
      expectedRecipients,
      historyAverage ?? BOOTSTRAP_LOW_RECIPIENTS,
      Math.max(BOOTSTRAP_LOW_RECIPIENTS, pipelineExpectedRecipients + STARTING_USER_COUNT),
    ),
  );
  const recipientHigh = Math.max(
    expectedRecipients,
    BOOTSTRAP_HIGH_RECIPIENTS,
    pipelineStressRecipients + STARTING_USER_COUNT + FUTURE_ENTRY_STRESS,
    historyAverage === null ? 0 : historyAverage + 2,
  );

  const currentlyUnreserved = observedPoolBalance > reservedExisting
    ? observedPoolBalance - reservedExisting
    : 0n;
  const futureAvailable = currentlyUnreserved + projectedAllocation;
  const pricingCapacity = clampBigInt(
    futureAvailable,
    0n,
    projectedAllocation,
  );

  const baseReward = expectedRecipients > 0
    ? pricingCapacity / BigInt(expectedRecipients)
    : 0n;
  const lowReward = recipientHigh > 0
    ? clampBigInt(
        projectedAllocationLow,
        0n,
        futureAvailable,
      ) / BigInt(recipientHigh)
    : 0n;
  const highReward = recipientLow > 0
    ? clampBigInt(
        projectedAllocationHigh,
        0n,
        futureAvailable,
      ) / BigInt(recipientLow)
    : 0n;

  const normalizedLow = lowReward > baseReward ? baseReward : lowReward;
  const normalizedHigh = highReward < baseReward ? baseReward : highReward;

  return {
    modelVersion: REWARD_FORECAST_MODEL_VERSION,
    projectedAllocationWei: projectedAllocation.toString(),
    projectedAllocationLowWei: projectedAllocationLow.toString(),
    projectedAllocationHighWei: projectedAllocationHigh.toString(),
    allocationSampleCount: allocations.length,
    recipientHistoryRoundCount: recipientHistory.length,
    expectedRecipients,
    recipientLow,
    recipientHigh,
    estimatedRewardWei: baseReward.toString(),
    estimatedRewardLowWei: normalizedLow.toString(),
    estimatedRewardHighWei: normalizedHigh.toString(),
    pricingCapacityWei: pricingCapacity.toString(),
    pipelineExpectedRecipients,
    pipelineStressRecipients,
  };
}
