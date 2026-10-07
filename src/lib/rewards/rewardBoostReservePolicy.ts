export const REWARD_BOOST_RESERVE_SHADOW_MODEL_VERSION =
  'reward-boost-reserve-shadow-v1';

export const REWARD_BOOST_RESERVE_LONG_INCOMPLETE_ROUNDS = 2;
export const REWARD_BOOST_RESERVE_PROMOTION_RESERVE_BPS = 1_500;
export const REWARD_BOOST_RESERVE_LATE_STRESS_EXTRA_RECIPIENTS = 1;

const BPS = 10_000n;
const INTEGER_PATTERN = /^\d+$/;

export type RewardBoostReserveLateParticipant = {
  appsCompleted: number;
  vot3Converted: boolean;
  voteCompleted: boolean;
};

export type RewardBoostReserveCohortInput = {
  rewardCohortRoundId: number;
  allocationReceiptId: string;
  officialAllocationWei: string;
  promotionFundingWei: string;
  committedWei: string;
  lateRewardWei: string;
  queuedEligibleCount: number;
  lateParticipants: RewardBoostReserveLateParticipant[];
};

export type RewardBoostReserveCohortResult = {
  rewardCohortRoundId: number;
  allocationReceiptId: string;
  officialAllocationWei: string;
  promotionFundingWei: string;
  committedWei: string;
  lateRewardWei: string;
  queuedEligibleCount: number;
  reusableOfficialWei: string;
  reusablePromotionWei: string;
  promotionReserveWei: string;
  sweepablePromotionWei: string;
  reusableTotalWei: string;
  lateCompletionWeightedBps: string;
  lateCompletionWeightedLiabilityWei: string;
  lateCompletionStressExtraWei: string;
  lateCompletionProtectedWei: string;
  sweepableWei: string;
  longIncompleteCount: number;
};

export type RewardBoostReserveShadowResult = {
  modelVersion: string;
  currentCohortRoundId: number;
  longIncompleteAfterRounds: number;
  reusableThroughCohortRoundId: number;
  promotionReserveBps: number;
  currentRewardWei: string;
  currentPricingCapacityWei: string;
  currentStressRecipients: number;
  observedPoolBalanceWei: string;
  reservedExistingWei: string;
  physicalUnreservedPoolWei: string;
  promotionReserveWei: string;
  longIncompleteCount: number;
  queuedEligibleCount: number;
  lateCompletionWeightedBps: string;
  lateCompletionProtectedRecipients: number;
  lateCompletionWeightedLiabilityWei: string;
  lateCompletionStressExtraWei: string;
  lateCompletionProtectedWei: string;
  reusableOfficialWei: string;
  reusablePromotionWei: string;
  reusableGrossWei: string;
  reusableAfterLateProtectionWei: string;
  physicalBoostCapacityWei: string;
  boostAvailableWei: string;
  shadowBoostedPricingCapacityWei: string;
  shadowBoostedRewardWei: string;
  shadowExternalCompletionRewardWei: string;
  balancedBoostReleaseWei: string;
  shadowBalancedPricingCapacityWei: string;
  shadowBalancedRewardWei: string;
  sourceAttributionPolicy: 'PROMOTION_FIRST_CONSERVATIVE';
  cohorts: RewardBoostReserveCohortResult[];
};

function parseWei(value: string, fieldName: string): bigint {
  if (!INTEGER_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a non-negative integer string.`);
  }
  return BigInt(value);
}

function safeRound(value: number, fieldName: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${fieldName} must be a positive safe integer.`);
  }
  return value;
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

function lateParticipantWeightBps(
  participant: RewardBoostReserveLateParticipant,
): bigint {
  const appsCompleted = safeCount(
    participant.appsCompleted,
    'lateParticipant.appsCompleted',
  );

  if (participant.voteCompleted) return 10_000n;
  if (appsCompleted >= 3 && participant.vot3Converted) return 9_500n;
  if (appsCompleted >= 3) return 9_000n;
  if (appsCompleted === 2) return 6_000n;
  if (appsCompleted === 1) return 4_000n;
  return 2_500n;
}

function sourceSeparatedRemainder(input: RewardBoostReserveCohortInput) {
  const official = parseWei(input.officialAllocationWei, 'officialAllocationWei');
  const promotion = parseWei(input.promotionFundingWei, 'promotionFundingWei');
  const committed = parseWei(input.committedWei, 'committedWei');
  const designated = official + promotion;
  const boundedCommitted = committed < designated ? committed : designated;

  // Historical rewards are fungible, so exact source consumption cannot be
  // reconstructed after the fact. For shadow accounting, attribute historical
  // commitments to promotion funding first. This is deterministic, conservative
  // for the promotion remainder, and never changes the total reusable amount.
  const promotionConsumed = boundedCommitted < promotion
    ? boundedCommitted
    : promotion;
  const officialConsumed = boundedCommitted > promotion
    ? boundedCommitted - promotion
    : 0n;

  const reusablePromotion = promotion - promotionConsumed;
  const reusableOfficial = official > officialConsumed
    ? official - officialConsumed
    : 0n;

  return {
    reusableOfficial,
    reusablePromotion,
    reusableTotal: designated > committed
      ? designated - committed
      : 0n,
  };
}

export function calculateRewardBoostReserveShadow(input: {
  currentCohortRoundId: number;
  currentRewardWei: string;
  currentPricingCapacityWei: string;
  currentStressRecipients: number;
  observedPoolBalanceWei: string;
  reservedExistingWei: string;
  cohorts: RewardBoostReserveCohortInput[];
  longIncompleteAfterRounds?: number;
  promotionReserveBps?: number;
}): RewardBoostReserveShadowResult {
  const currentCohortRoundId = safeRound(
    input.currentCohortRoundId,
    'currentCohortRoundId',
  );
  const longIncompleteAfterRounds =
    input.longIncompleteAfterRounds ??
    REWARD_BOOST_RESERVE_LONG_INCOMPLETE_ROUNDS;
  const promotionReserveBps =
    input.promotionReserveBps ??
    REWARD_BOOST_RESERVE_PROMOTION_RESERVE_BPS;

  if (
    !Number.isSafeInteger(longIncompleteAfterRounds) ||
    longIncompleteAfterRounds < 1 ||
    longIncompleteAfterRounds > 52
  ) {
    throw new Error('longIncompleteAfterRounds is invalid.');
  }
  if (
    !Number.isSafeInteger(promotionReserveBps) ||
    promotionReserveBps < 0 ||
    promotionReserveBps > 5_000
  ) {
    throw new Error('promotionReserveBps is invalid.');
  }

  const currentReward = parseWei(input.currentRewardWei, 'currentRewardWei');
  const currentPricingCapacity = parseWei(
    input.currentPricingCapacityWei,
    'currentPricingCapacityWei',
  );
  const currentStressRecipients = safeCount(
    input.currentStressRecipients,
    'currentStressRecipients',
  );
  if (currentStressRecipients < 1) {
    throw new Error('currentStressRecipients must be at least 1.');
  }
  const observedPool = parseWei(
    input.observedPoolBalanceWei,
    'observedPoolBalanceWei',
  );
  const reservedExisting = parseWei(
    input.reservedExistingWei,
    'reservedExistingWei',
  );
  const physicalUnreservedPool = observedPool > reservedExisting
    ? observedPool - reservedExisting
    : 0n;
  let promotionReserveTotal = 0n;

  const reusableThroughCohortRoundId =
    currentCohortRoundId - longIncompleteAfterRounds;

  let reusableOfficial = 0n;
  let reusablePromotion = 0n;
  let weightedLateBps = 0n;
  let longIncompleteCount = 0;
  let queuedEligibleCountTotal = 0;

  const cohortResults: RewardBoostReserveCohortResult[] = [];

  for (const cohort of input.cohorts) {
    const rewardCohortRoundId = safeRound(
      cohort.rewardCohortRoundId,
      'cohort.rewardCohortRoundId',
    );

    if (rewardCohortRoundId > reusableThroughCohortRoundId) {
      continue;
    }

    if (
      !INTEGER_PATTERN.test(cohort.allocationReceiptId) ||
      BigInt(cohort.allocationReceiptId) < 1n
    ) {
      throw new Error('cohort.allocationReceiptId is invalid.');
    }

    const remainder = sourceSeparatedRemainder(cohort);
    const promotionFunding = parseWei(
      cohort.promotionFundingWei,
      'cohort.promotionFundingWei',
    );
    const cohortPromotionReserve = remainder.reusablePromotion <
      ceilDiv(
        promotionFunding * BigInt(promotionReserveBps),
        BPS,
      )
      ? remainder.reusablePromotion
      : ceilDiv(
          promotionFunding * BigInt(promotionReserveBps),
          BPS,
        );
    const sweepablePromotion =
      remainder.reusablePromotion > cohortPromotionReserve
        ? remainder.reusablePromotion - cohortPromotionReserve
        : 0n;
    promotionReserveTotal += cohortPromotionReserve;

    const lateReward = parseWei(
      cohort.lateRewardWei,
      'cohort.lateRewardWei',
    );

    reusableOfficial += remainder.reusableOfficial;
    reusablePromotion += remainder.reusablePromotion;

    const queuedEligibleCount = safeCount(
      cohort.queuedEligibleCount,
      'cohort.queuedEligibleCount',
    );
    queuedEligibleCountTotal += queuedEligibleCount;
    let cohortWeightedLateBps =
      BigInt(queuedEligibleCount) * BPS;
    weightedLateBps += BigInt(queuedEligibleCount) * BPS;

    for (const participant of cohort.lateParticipants) {
      const weightBps = lateParticipantWeightBps(participant);
      cohortWeightedLateBps += weightBps;
      weightedLateBps += weightBps;
      longIncompleteCount += 1;
    }

    const cohortWeightedLateLiability = ceilDiv(
      lateReward * cohortWeightedLateBps,
      BPS,
    );

    cohortResults.push({
      rewardCohortRoundId,
      allocationReceiptId: BigInt(cohort.allocationReceiptId).toString(),
      officialAllocationWei: parseWei(
        cohort.officialAllocationWei,
        'cohort.officialAllocationWei',
      ).toString(),
      promotionFundingWei: promotionFunding.toString(),
      committedWei: parseWei(
        cohort.committedWei,
        'cohort.committedWei',
      ).toString(),
      lateRewardWei: lateReward.toString(),
      queuedEligibleCount,
      reusableOfficialWei: remainder.reusableOfficial.toString(),
      reusablePromotionWei: remainder.reusablePromotion.toString(),
      promotionReserveWei: cohortPromotionReserve.toString(),
      sweepablePromotionWei: sweepablePromotion.toString(),
      reusableTotalWei: (
        remainder.reusableOfficial + sweepablePromotion
      ).toString(),
      lateCompletionWeightedBps: cohortWeightedLateBps.toString(),
      lateCompletionWeightedLiabilityWei:
        cohortWeightedLateLiability.toString(),
      lateCompletionStressExtraWei: '0',
      lateCompletionProtectedWei:
        cohortWeightedLateLiability.toString(),
      sweepableWei:
        (
          remainder.reusableOfficial + sweepablePromotion >
            cohortWeightedLateLiability
            ? remainder.reusableOfficial +
              sweepablePromotion -
              cohortWeightedLateLiability
            : 0n
        ).toString(),
      longIncompleteCount: cohort.lateParticipants.length,
    });
  }

  const reusableGross = reusableOfficial + reusablePromotion;
  const weightedLateRecipients = toSafeNumber(
    ceilDiv(weightedLateBps, BPS),
    'lateCompletionWeightedRecipients',
  );
  const protectedCandidateCount =
    longIncompleteCount + queuedEligibleCountTotal;
  const stressExtraRecipientCount =
    longIncompleteCount > 0
      ? REWARD_BOOST_RESERVE_LATE_STRESS_EXTRA_RECIPIENTS
      : 0;
  const lateCompletionProtectedRecipients =
    protectedCandidateCount === 0
      ? 0
      : Math.min(
          protectedCandidateCount,
          weightedLateRecipients + stressExtraRecipientCount,
        );

  let stressCohortIndex = -1;
  let stressCohortReward = 0n;
  for (let index = 0; index < cohortResults.length; index += 1) {
    const cohort = cohortResults[index];
    if (cohort.longIncompleteCount <= 0) continue;
    const lateReward = BigInt(cohort.lateRewardWei);
    if (lateReward > stressCohortReward) {
      stressCohortReward = lateReward;
      stressCohortIndex = index;
    }
  }

  if (stressCohortIndex >= 0) {
    const cohort = cohortResults[stressCohortIndex];
    const weightedLiability = BigInt(
      cohort.lateCompletionWeightedLiabilityWei,
    );
    const protectedWei = weightedLiability + stressCohortReward;
    const reusableTotal = BigInt(cohort.reusableTotalWei);

    cohort.lateCompletionStressExtraWei = stressCohortReward.toString();
    cohort.lateCompletionProtectedWei = protectedWei.toString();
    cohort.sweepableWei =
      (reusableTotal > protectedWei
        ? reusableTotal - protectedWei
        : 0n
      ).toString();
  }

  const lateCompletionWeightedLiability =
    cohortResults.reduce(
      (sum, cohort) =>
        sum + BigInt(cohort.lateCompletionWeightedLiabilityWei),
      0n,
    );
  const lateCompletionStressExtra =
    stressCohortIndex >= 0 ? stressCohortReward : 0n;
  const lateCompletionProtected =
    cohortResults.reduce(
      (sum, cohort) =>
        sum + BigInt(cohort.lateCompletionProtectedWei),
      0n,
    );
  const reusableAfterLateProtection =
    cohortResults.reduce(
      (sum, cohort) => sum + BigInt(cohort.sweepableWei),
      0n,
    );
  const protectedPhysicalCapacity =
    promotionReserveTotal +
    lateCompletionProtected +
    currentPricingCapacity;
  const physicalBoostCapacity =
    physicalUnreservedPool > protectedPhysicalCapacity
      ? physicalUnreservedPool - protectedPhysicalCapacity
      : 0n;
  const boostAvailable = reusableAfterLateProtection < physicalBoostCapacity
    ? reusableAfterLateProtection
    : physicalBoostCapacity;
  const shadowBoostedPricingCapacity =
    currentPricingCapacity + boostAvailable;
  const shadowBoostedReward =
    shadowBoostedPricingCapacity / BigInt(currentStressRecipients);
  const shadowExternalCompletionReward =
    shadowBoostedPricingCapacity /
    BigInt(currentStressRecipients + 1);

  // Balanced shadow policy: historical reserve may match, but not exceed,
  // the current cohort's fresh pricing capacity. This keeps accumulated
  // surplus useful across multiple rounds instead of letting one quiet round
  // consume the entire reserve at once.
  const balancedBoostRelease =
    boostAvailable < currentPricingCapacity
      ? boostAvailable
      : currentPricingCapacity;
  const shadowBalancedPricingCapacity =
    currentPricingCapacity + balancedBoostRelease;
  const shadowBalancedReward =
    shadowBalancedPricingCapacity /
    BigInt(currentStressRecipients);

  return {
    modelVersion: REWARD_BOOST_RESERVE_SHADOW_MODEL_VERSION,
    currentCohortRoundId,
    longIncompleteAfterRounds,
    reusableThroughCohortRoundId,
    promotionReserveBps,
    currentRewardWei: currentReward.toString(),
    currentPricingCapacityWei: currentPricingCapacity.toString(),
    currentStressRecipients,
    observedPoolBalanceWei: observedPool.toString(),
    reservedExistingWei: reservedExisting.toString(),
    physicalUnreservedPoolWei: physicalUnreservedPool.toString(),
    promotionReserveWei: promotionReserveTotal.toString(),
    longIncompleteCount,
    queuedEligibleCount: queuedEligibleCountTotal,
    lateCompletionWeightedBps: weightedLateBps.toString(),
    lateCompletionProtectedRecipients,
    lateCompletionWeightedLiabilityWei:
      lateCompletionWeightedLiability.toString(),
    lateCompletionStressExtraWei:
      lateCompletionStressExtra.toString(),
    lateCompletionProtectedWei: lateCompletionProtected.toString(),
    reusableOfficialWei: reusableOfficial.toString(),
    reusablePromotionWei: reusablePromotion.toString(),
    reusableGrossWei: reusableGross.toString(),
    reusableAfterLateProtectionWei:
      reusableAfterLateProtection.toString(),
    physicalBoostCapacityWei: physicalBoostCapacity.toString(),
    boostAvailableWei: boostAvailable.toString(),
    shadowBoostedPricingCapacityWei:
      shadowBoostedPricingCapacity.toString(),
    shadowBoostedRewardWei: shadowBoostedReward.toString(),
    shadowExternalCompletionRewardWei:
      shadowExternalCompletionReward.toString(),
    balancedBoostReleaseWei:
      balancedBoostRelease.toString(),
    shadowBalancedPricingCapacityWei:
      shadowBalancedPricingCapacity.toString(),
    shadowBalancedRewardWei:
      shadowBalancedReward.toString(),
    sourceAttributionPolicy: 'PROMOTION_FIRST_CONSERVATIVE',
    cohorts: cohortResults.sort(
      (a, b) => a.rewardCohortRoundId - b.rewardCohortRoundId,
    ),
  };
}
