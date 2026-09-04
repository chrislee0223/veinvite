export const REWARD_FORECAST_MODEL_VERSION = 'reward-forecast-v2.1-cohort';

const BPS = 10_000n;
const BOOTSTRAP_BASE_RECIPIENTS = 6;
const BOOTSTRAP_LOW_RECIPIENTS = 4;
const BOOTSTRAP_HIGH_RECIPIENTS = 8;
const STARTING_USER_COUNT = 1;
const FUTURE_ENTRY_BASE = 2;
const FUTURE_ENTRY_STRESS = 3;
const COMPLETION_TIME_STRESS_GROWTH_BPS = 12_500n;
const COMPLETION_TIME_MIN_STRESS_RECIPIENTS = 4;
const COMPLETION_TIME_STRESS_EXTRA_RECIPIENTS = 2;

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
  officialAllocationWei: string;
  fundingAdjustmentWei: string;
  designatedBudgetWei: string;
  cohortReservedWei: string;
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
  vot3ReadyCount: 9_000,
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

function toSafeNumber(value: bigint, fieldName: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} exceeds the safe integer range.`);
  }
  return Number(value);
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

function completionTimeStressRecipientFloor(
  pipeline: RewardForecastPipeline,
): number {
  // Completion-time reservations intentionally exclude unaccepted invitations,
  // because they have no verified cohort yet. Mirror the fixed-reservation
  // denominator here so aging pending invites can never make the public midpoint
  // imply a larger reward than the amount the payout path would reserve.
  const activeExpectedWeightedBps = pipelineWeightedBps(
    pipeline,
    EXPECTED_WEIGHTS_BPS,
    0,
  );
  const activeStressWeightedBps = pipelineWeightedBps(
    pipeline,
    STRESS_WEIGHTS_BPS,
    0,
  );
  const expectedCompletions = toSafeNumber(
    ceilDiv(activeExpectedWeightedBps, BPS),
    'completionTimeExpectedRecipients',
  );
  const stressWithGrowth = toSafeNumber(
    ceilDiv(
      activeStressWeightedBps * COMPLETION_TIME_STRESS_GROWTH_BPS,
      BPS * BPS,
    ),
    'completionTimeStressRecipients',
  );

  return Math.max(
    COMPLETION_TIME_MIN_STRESS_RECIPIENTS,
    pipeline.queuedEligibleCount,
    expectedCompletions,
    stressWithGrowth + COMPLETION_TIME_STRESS_EXTRA_RECIPIENTS,
  );
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
 * Public midpoint estimate for the currently funded participant cohort.
 * The numerator is funding already designated to this cohort: the prior
 * VeBetter official user allocation plus separately audited cohort adjustments.
 * Historical allocation samples remain learning data only and do not alter the
 * known current-round funding numerator.
 */
export function calculateRewardForecastPolicy(input: {
  officialAllocationWei: string;
  fundingAdjustmentWei: string;
  cohortReservedWei: string;
  observedPoolBalanceWei: string;
  reservedExistingWei: string;
  allocationSampleCount: number;
  pipeline: RewardForecastPipeline;
  completedRewardRoundRecipientCounts: number[];
}): RewardForecastPolicy {
  const officialAllocation = parseWei(input.officialAllocationWei, 'officialAllocationWei');
  const fundingAdjustment = parseWei(input.fundingAdjustmentWei, 'fundingAdjustmentWei');
  const cohortReserved = parseWei(input.cohortReservedWei, 'cohortReservedWei');
  const observedPoolBalance = parseWei(input.observedPoolBalanceWei, 'observedPoolBalanceWei');
  const reservedExisting = parseWei(input.reservedExistingWei, 'reservedExistingWei');
  const allocationSampleCount = safeCount(input.allocationSampleCount, 'allocationSampleCount');

  const pipeline: RewardForecastPipeline = {
    queuedEligibleCount: safeCount(input.pipeline.queuedEligibleCount, 'queuedEligibleCount'),
    voteReadyCount: safeCount(input.pipeline.voteReadyCount, 'voteReadyCount'),
    vot3ReadyCount: safeCount(input.pipeline.vot3ReadyCount, 'vot3ReadyCount'),
    appsTwoCount: safeCount(input.pipeline.appsTwoCount, 'appsTwoCount'),
    appsOneCount: safeCount(input.pipeline.appsOneCount, 'appsOneCount'),
    activatedZeroCount: safeCount(input.pipeline.activatedZeroCount, 'activatedZeroCount'),
    pendingAcceptanceExpectedBps: safeCount(input.pipeline.pendingAcceptanceExpectedBps, 'pendingAcceptanceExpectedBps'),
    pendingAcceptanceStressBps: safeCount(input.pipeline.pendingAcceptanceStressBps, 'pendingAcceptanceStressBps'),
  };

  const designatedBudget = officialAllocation + fundingAdjustment;
  const remainingCohortBudget = designatedBudget > cohortReserved
    ? designatedBudget - cohortReserved
    : 0n;
  const currentlyUnreservedPool = observedPoolBalance > reservedExisting
    ? observedPoolBalance - reservedExisting
    : 0n;
  const pricingCapacity = remainingCohortBudget < currentlyUnreservedPool
    ? remainingCohortBudget
    : currentlyUnreservedPool;

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
  const completionTimeStressFloor = completionTimeStressRecipientFloor(pipeline);

  const recipientHistory = input.completedRewardRoundRecipientCounts.slice(0, 8);
  const historyAverage = historicalRecipientAverage(recipientHistory);
  const learnedBase = blendBootstrapWithHistory(historyAverage, recipientHistory.length);

  const expectedRecipients = Math.max(
    learnedBase,
    pipelineExpectedRecipients + STARTING_USER_COUNT + FUTURE_ENTRY_BASE,
    completionTimeStressFloor,
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

  const baseReward = pricingCapacity / BigInt(expectedRecipients);
  const lowReward = pricingCapacity / BigInt(recipientHigh);
  const highReward = pricingCapacity / BigInt(recipientLow);

  return {
    modelVersion: REWARD_FORECAST_MODEL_VERSION,
    officialAllocationWei: officialAllocation.toString(),
    fundingAdjustmentWei: fundingAdjustment.toString(),
    designatedBudgetWei: designatedBudget.toString(),
    cohortReservedWei: cohortReserved.toString(),
    // Legacy storage/API names are retained for compatibility. In v2 they are
    // the known cohort pricing capacity, not a future-allocation projection.
    projectedAllocationWei: pricingCapacity.toString(),
    projectedAllocationLowWei: pricingCapacity.toString(),
    projectedAllocationHighWei: pricingCapacity.toString(),
    allocationSampleCount,
    recipientHistoryRoundCount: recipientHistory.length,
    expectedRecipients,
    recipientLow,
    recipientHigh,
    estimatedRewardWei: baseReward.toString(),
    estimatedRewardLowWei: lowReward.toString(),
    estimatedRewardHighWei: highReward.toString(),
    pricingCapacityWei: pricingCapacity.toString(),
    pipelineExpectedRecipients,
    pipelineStressRecipients,
  };
}
