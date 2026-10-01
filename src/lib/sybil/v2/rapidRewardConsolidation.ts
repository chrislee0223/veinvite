import type {
  SybilV2Signal,
} from '@/lib/sybil/v2/policy';

export type HistoricalRewardFlowPoint = {
  blockTimestamp: string;
  amountWei: string;
};

export type HistoricalOutflowFlowPoint = {
  destinationWallet: string;
  blockTimestamp: string;
  amountWei: string;
};

export type RapidRewardConsolidationFinding = {
  signal: SybilV2Signal;
  rewardEventCount: number;
  rapidRewardEventCount: number;
  rapidRewardShareBps: number;
  rewardSpanSeconds: number;
  totalRewardWei: string;
  totalOutflowWei: string;
  outflowCoverageBps: number;
  dominantDestination: string;
  dominantDestinationShareBps: number;
  maxDelaySeconds: number;
};

function safeWei(value: string): bigint | null {
  if (!/^\d+$/u.test(value)) return null;

  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

function basisPoints(
  numerator: bigint,
  denominator: bigint,
): number {
  if (denominator <= 0n || numerator <= 0n) return 0;
  return Math.min(
    10_000,
    Number((numerator * 10_000n) / denominator),
  );
}

/**
 * Detects repeated reward-harvesting / consolidation behavior without tying
 * the rule to a specific wallet, app, amount, or exact observed case.
 *
 * This is intentionally HOLD-only evidence. A legitimate user may sweep
 * rewards to a main wallet, so the signal must never be an automatic
 * blacklist by itself.
 */
export function detectRapidRewardConsolidation({
  rewards,
  outflows,
  knownProtocolDestinations,
  maxDelaySeconds = 5 * 60,
  minimumRewardEvents = 5,
  minimumRewardSpanSeconds = 24 * 60 * 60,
  minimumRapidRewardShareBps = 7_500,
  minimumOutflowCoverageBps = 8_000,
  minimumDominantDestinationShareBps = 6_000,
}: {
  rewards: HistoricalRewardFlowPoint[];
  outflows: HistoricalOutflowFlowPoint[];
  knownProtocolDestinations: Set<string>;
  maxDelaySeconds?: number;
  minimumRewardEvents?: number;
  minimumRewardSpanSeconds?: number;
  minimumRapidRewardShareBps?: number;
  minimumOutflowCoverageBps?: number;
  minimumDominantDestinationShareBps?: number;
}): RapidRewardConsolidationFinding | null {
  const validRewards = rewards
    .map((reward) => ({
      at: Date.parse(reward.blockTimestamp),
      amount: safeWei(reward.amountWei),
    }))
    .filter(
      (reward): reward is { at: number; amount: bigint } =>
        !Number.isNaN(reward.at) &&
        reward.amount !== null &&
        reward.amount > 0n,
    )
    .sort((left, right) => left.at - right.at);

  if (validRewards.length < minimumRewardEvents) {
    return null;
  }

  const rewardSpanSeconds =
    (validRewards[validRewards.length - 1]!.at -
      validRewards[0]!.at) /
    1000;

  if (rewardSpanSeconds < minimumRewardSpanSeconds) {
    return null;
  }

  const firstRewardAt = validRewards[0]!.at;
  const validOutflows = outflows
    .map((outflow) => ({
      destination: outflow.destinationWallet.toLowerCase(),
      at: Date.parse(outflow.blockTimestamp),
      amount: safeWei(outflow.amountWei),
    }))
    .filter(
      (
        outflow,
      ): outflow is {
        destination: string;
        at: number;
        amount: bigint;
      } =>
        /^0x[0-9a-f]{40}$/u.test(outflow.destination) &&
        !knownProtocolDestinations.has(outflow.destination) &&
        !Number.isNaN(outflow.at) &&
        outflow.at >= firstRewardAt &&
        outflow.amount !== null &&
        outflow.amount > 0n,
    )
    .sort((left, right) => left.at - right.at);

  if (validOutflows.length === 0) {
    return null;
  }

  const rapidRewardEventCount = validRewards.filter((reward) =>
    validOutflows.some((outflow) => {
      const delaySeconds = (outflow.at - reward.at) / 1000;
      return (
        delaySeconds >= 0 &&
        delaySeconds <= maxDelaySeconds
      );
    }),
  ).length;

  const rapidRewardShareBps = Math.floor(
    (rapidRewardEventCount * 10_000) /
      validRewards.length,
  );

  const totalRewardWei = validRewards.reduce(
    (sum, reward) => sum + reward.amount,
    0n,
  );
  const totalOutflowWei = validOutflows.reduce(
    (sum, outflow) => sum + outflow.amount,
    0n,
  );
  const outflowCoverageBps = basisPoints(
    totalOutflowWei,
    totalRewardWei,
  );

  const destinationTotals = new Map<string, bigint>();
  for (const outflow of validOutflows) {
    destinationTotals.set(
      outflow.destination,
      (destinationTotals.get(outflow.destination) ?? 0n) +
        outflow.amount,
    );
  }

  const dominant = [...destinationTotals.entries()]
    .sort((left, right) =>
      left[1] === right[1]
        ? left[0].localeCompare(right[0])
        : left[1] > right[1]
          ? -1
          : 1,
    )[0];

  if (!dominant) return null;

  const dominantDestinationShareBps = basisPoints(
    dominant[1],
    totalOutflowWei,
  );

  if (
    rapidRewardShareBps < minimumRapidRewardShareBps ||
    outflowCoverageBps < minimumOutflowCoverageBps ||
    dominantDestinationShareBps <
      minimumDominantDestinationShareBps
  ) {
    return null;
  }

  const score = Math.min(
    85,
    55 +
      Math.floor((rapidRewardShareBps - 7_500) / 500) * 3 +
      Math.floor((dominantDestinationShareBps - 6_000) / 1_000) * 2,
  );

  return {
    signal: {
      code: 'HISTORICAL_RAPID_REWARD_CONSOLIDATION',
      family: 'HISTORICAL_CONSOLIDATION',
      strength: 'HIGH',
      score,
      independentKey: dominant[0],
    },
    rewardEventCount: validRewards.length,
    rapidRewardEventCount,
    rapidRewardShareBps,
    rewardSpanSeconds,
    totalRewardWei: totalRewardWei.toString(),
    totalOutflowWei: totalOutflowWei.toString(),
    outflowCoverageBps,
    dominantDestination: dominant[0],
    dominantDestinationShareBps,
    maxDelaySeconds,
  };
}
