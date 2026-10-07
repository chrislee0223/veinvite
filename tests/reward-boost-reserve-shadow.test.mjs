import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateRewardBoostReserveShadow,
  REWARD_BOOST_RESERVE_LONG_INCOMPLETE_ROUNDS,
  REWARD_BOOST_RESERVE_PROMOTION_RESERVE_BPS,
} from '../src/lib/rewards/rewardBoostReservePolicy.ts';

const E18 = 10n ** 18n;

function b3tr(value) {
  return (BigInt(value) * E18).toString();
}

test('two-round threshold excludes the current and immediately prior cohort', () => {
  const result = calculateRewardBoostReserveShadow({
    currentCohortRoundId: 119,
    currentRewardWei: b3tr(200),
    currentPricingCapacityWei: b3tr(800),
    currentStressRecipients: 4,
    observedPoolBalanceWei: b3tr(6000),
    reservedExistingWei: b3tr(200),
    cohorts: [
      {
        rewardCohortRoundId: 117,
        allocationReceiptId: '1',
        officialAllocationWei: b3tr(1000),
        promotionFundingWei: '0',
        committedWei: b3tr(200),
        lateRewardWei: '0',
        queuedEligibleCount: 0,
        lateParticipants: [],
      },
      {
        rewardCohortRoundId: 118,
        allocationReceiptId: '2',
        officialAllocationWei: b3tr(1000),
        promotionFundingWei: '0',
        committedWei: '0',
        lateRewardWei: '0',
        queuedEligibleCount: 0,
        lateParticipants: [],
      },
    ],
  });

  assert.equal(
    result.longIncompleteAfterRounds,
    REWARD_BOOST_RESERVE_LONG_INCOMPLETE_ROUNDS,
  );
  assert.equal(result.reusableThroughCohortRoundId, 117);
  assert.equal(result.cohorts.length, 1);
  assert.equal(result.cohorts[0].rewardCohortRoundId, 117);
  assert.equal(result.reusableGrossWei, b3tr(800));
});

test('source attribution conserves total reusable funding with promotion', () => {
  const result = calculateRewardBoostReserveShadow({
    currentCohortRoundId: 120,
    currentRewardWei: b3tr(100),
    currentPricingCapacityWei: b3tr(400),
    currentStressRecipients: 4,
    observedPoolBalanceWei: b3tr(5000),
    reservedExistingWei: '0',
    cohorts: [
      {
        rewardCohortRoundId: 114,
        allocationReceiptId: '7',
        officialAllocationWei: b3tr(900),
        promotionFundingWei: b3tr(1200),
        committedWei: b3tr(500),
        lateRewardWei: '0',
        queuedEligibleCount: 0,
        lateParticipants: [],
      },
    ],
  });

  assert.equal(result.reusableOfficialWei, b3tr(900));
  assert.equal(result.reusablePromotionWei, b3tr(700));
  assert.equal(result.promotionReserveWei, b3tr(180));
  assert.equal(result.cohorts[0].promotionReserveWei, b3tr(180));
  assert.equal(result.cohorts[0].sweepablePromotionWei, b3tr(520));
  assert.equal(result.reusableGrossWei, b3tr(1600));
  assert.equal(result.reusableAfterLateProtectionWei, b3tr(1420));
  assert.equal(
    BigInt(result.reusableOfficialWei) +
      BigInt(result.reusablePromotionWei),
    BigInt(result.reusableGrossWei),
  );
});

test('late participants receive pooled protection before boost capacity', () => {
  const result = calculateRewardBoostReserveShadow({
    currentCohortRoundId: 119,
    currentRewardWei: b3tr(200),
    currentPricingCapacityWei: b3tr(800),
    currentStressRecipients: 4,
    observedPoolBalanceWei: b3tr(6000),
    reservedExistingWei: b3tr(200),
    cohorts: [
      {
        rewardCohortRoundId: 117,
        allocationReceiptId: '3',
        officialAllocationWei: b3tr(3000),
        promotionFundingWei: '0',
        committedWei: '0',
        lateRewardWei: b3tr(200),
        queuedEligibleCount: 0,
        lateParticipants: [
          { appsCompleted: 0, vot3Converted: false, voteCompleted: false },
          { appsCompleted: 0, vot3Converted: false, voteCompleted: false },
          { appsCompleted: 1, vot3Converted: false, voteCompleted: false },
          { appsCompleted: 2, vot3Converted: false, voteCompleted: false },
          { appsCompleted: 3, vot3Converted: true, voteCompleted: false },
        ],
      },
    ],
  });

  // Weighted liability is 2.45 × 200 = 490, plus one 200 stress completion.
  assert.equal(result.longIncompleteCount, 5);
  assert.equal(result.lateCompletionProtectedRecipients, 4);
  assert.equal(result.lateCompletionWeightedLiabilityWei, b3tr(490));
  assert.equal(result.lateCompletionStressExtraWei, b3tr(200));
  assert.equal(result.lateCompletionProtectedWei, b3tr(690));
  assert.equal(result.cohorts[0].lateCompletionStressExtraWei, '0');
  assert.equal(result.cohorts[0].lateCompletionProtectedWei, b3tr(490));
  assert.equal(result.cohorts[0].sweepableWei, b3tr(2510));
  assert.equal(result.bankDepositWei, b3tr(2510));
  assert.equal(result.bankStressReserveWei, b3tr(200));
  assert.equal(result.reusableAfterLateProtectionWei, b3tr(2310));
});

test('15 percent of original promotion funding stays as emergency reserve', () => {
  const result = calculateRewardBoostReserveShadow({
    currentCohortRoundId: 119,
    currentRewardWei: b3tr(200),
    currentPricingCapacityWei: b3tr(400),
    currentStressRecipients: 4,
    observedPoolBalanceWei: b3tr(3000),
    reservedExistingWei: '0',
    cohorts: [
      {
        rewardCohortRoundId: 117,
        allocationReceiptId: '4',
        officialAllocationWei: '0',
        promotionFundingWei: b3tr(1000),
        committedWei: '0',
        lateRewardWei: '0',
        queuedEligibleCount: 0,
        lateParticipants: [],
      },
    ],
  });

  assert.equal(
    result.promotionReserveBps,
    REWARD_BOOST_RESERVE_PROMOTION_RESERVE_BPS,
  );
  assert.equal(result.promotionReserveWei, b3tr(150));
  assert.equal(result.cohorts[0].promotionReserveWei, b3tr(150));
  assert.equal(result.cohorts[0].sweepablePromotionWei, b3tr(850));
  assert.equal(result.reusableAfterLateProtectionWei, b3tr(850));
  assert.equal(result.physicalBoostCapacityWei, b3tr(2450));
  assert.equal(result.boostAvailableWei, b3tr(850));
});

test('already committed rewards are never made reusable', () => {
  const result = calculateRewardBoostReserveShadow({
    currentCohortRoundId: 119,
    currentRewardWei: b3tr(200),
    currentPricingCapacityWei: b3tr(800),
    currentStressRecipients: 4,
    observedPoolBalanceWei: b3tr(3000),
    reservedExistingWei: '0',
    cohorts: [
      {
        rewardCohortRoundId: 116,
        allocationReceiptId: '5',
        officialAllocationWei: b3tr(1000),
        promotionFundingWei: '0',
        committedWei: b3tr(1000),
        lateRewardWei: '0',
        queuedEligibleCount: 0,
        lateParticipants: [],
      },
    ],
  });

  assert.equal(result.reusableGrossWei, '0');
  assert.equal(result.boostAvailableWei, '0');
});


test('shadow quote uses boost capacity without spending the bank upfront', () => {
  const result = calculateRewardBoostReserveShadow({
    currentCohortRoundId: 119,
    currentRewardWei: b3tr(200),
    currentPricingCapacityWei: b3tr(800),
    currentStressRecipients: 4,
    observedPoolBalanceWei: b3tr(6000),
    reservedExistingWei: '0',
    cohorts: [
      {
        rewardCohortRoundId: 117,
        allocationReceiptId: '9',
        officialAllocationWei: b3tr(1200),
        promotionFundingWei: '0',
        committedWei: '0',
        lateRewardWei: '0',
        queuedEligibleCount: 0,
        lateParticipants: [],
      },
    ],
  });

  assert.equal(result.boostAvailableWei, b3tr(1200));
  assert.equal(result.shadowBoostedPricingCapacityWei, b3tr(2000));
  assert.equal(result.shadowBoostedRewardWei, b3tr(500));
  assert.equal(result.shadowExternalCompletionRewardWei, b3tr(400));
  assert.equal(result.balancedBoostReleaseWei, b3tr(800));
  assert.equal(result.shadowBalancedPricingCapacityWei, b3tr(1600));
  assert.equal(result.shadowBalancedRewardWei, b3tr(400));
});


test('balanced shadow never lets historical reserve exceed fresh cohort pricing capacity', () => {
  const result = calculateRewardBoostReserveShadow({
    currentCohortRoundId: 119,
    currentRewardWei: b3tr(200),
    currentPricingCapacityWei: b3tr(800),
    currentStressRecipients: 4,
    observedPoolBalanceWei: b3tr(10000),
    reservedExistingWei: '0',
    cohorts: [
      {
        rewardCohortRoundId: 117,
        allocationReceiptId: '10',
        officialAllocationWei: b3tr(5000),
        promotionFundingWei: '0',
        committedWei: '0',
        lateRewardWei: '0',
        queuedEligibleCount: 0,
        lateParticipants: [],
      },
    ],
  });

  assert.equal(result.boostAvailableWei, b3tr(5000));
  assert.equal(result.balancedBoostReleaseWei, b3tr(800));
  assert.equal(result.shadowBalancedRewardWei, b3tr(400));
});


test('physical boost headroom excludes current pricing and promotion reserve', () => {
  const result = calculateRewardBoostReserveShadow({
    currentCohortRoundId: 119,
    currentRewardWei: b3tr(200),
    currentPricingCapacityWei: b3tr(800),
    currentStressRecipients: 4,
    observedPoolBalanceWei: b3tr(1000),
    reservedExistingWei: '0',
    cohorts: [
      {
        rewardCohortRoundId: 117,
        allocationReceiptId: '12',
        officialAllocationWei: '0',
        promotionFundingWei: b3tr(500),
        committedWei: '0',
        lateRewardWei: '0',
        queuedEligibleCount: 0,
        lateParticipants: [],
      },
    ],
  });

  // 1,000 physical - 800 current pricing - 75 promotion reserve = 125.
  assert.equal(result.promotionReserveWei, b3tr(75));
  assert.equal(result.physicalBoostCapacityWei, b3tr(125));
  assert.equal(result.boostAvailableWei, b3tr(125));
  assert.equal(result.shadowBoostedPricingCapacityWei, b3tr(925));
  assert.ok(
    BigInt(result.shadowBoostedPricingCapacityWei) +
      BigInt(result.promotionReserveWei) <=
      BigInt(result.physicalUnreservedPoolWei),
  );
});

test('late protection uses original cohort rates instead of one current rate', () => {
  const result = calculateRewardBoostReserveShadow({
    currentCohortRoundId: 119,
    currentRewardWei: b3tr(200),
    currentPricingCapacityWei: b3tr(800),
    currentStressRecipients: 4,
    observedPoolBalanceWei: b3tr(10000),
    reservedExistingWei: '0',
    cohorts: [
      {
        rewardCohortRoundId: 116,
        allocationReceiptId: '20',
        officialAllocationWei: b3tr(2000),
        promotionFundingWei: '0',
        committedWei: '0',
        lateRewardWei: b3tr(100),
        queuedEligibleCount: 0,
        lateParticipants: [
          { appsCompleted: 0, vot3Converted: false, voteCompleted: false },
        ],
      },
      {
        rewardCohortRoundId: 117,
        allocationReceiptId: '21',
        officialAllocationWei: b3tr(2000),
        promotionFundingWei: '0',
        committedWei: '0',
        lateRewardWei: b3tr(300),
        queuedEligibleCount: 0,
        lateParticipants: [
          { appsCompleted: 3, vot3Converted: true, voteCompleted: false },
        ],
      },
    ],
  });

  // 25% × 100 + 95% × 300 = 310 weighted liability.
  // One unexpected extra completion is protected at the max original rate 300.
  assert.equal(result.lateCompletionWeightedLiabilityWei, b3tr(310));
  assert.equal(result.lateCompletionStressExtraWei, b3tr(300));
  assert.equal(result.lateCompletionProtectedWei, b3tr(610));
  assert.equal(result.cohorts[0].lateCompletionProtectedWei, b3tr(25));
  assert.equal(result.cohorts[0].sweepableWei, b3tr(1975));
  assert.equal(result.cohorts[1].lateCompletionProtectedWei, b3tr(285));
  assert.equal(result.cohorts[1].lateCompletionStressExtraWei, '0');
  assert.equal(result.cohorts[1].sweepableWei, b3tr(1715));
  assert.equal(result.bankDepositWei, b3tr(3690));
  assert.equal(result.bankStressReserveWei, b3tr(300));
  assert.equal(result.reusableAfterLateProtectionWei, b3tr(3390));
});


test('completed clear but unreserved referrals are fully protected from sweeping', () => {
  const result = calculateRewardBoostReserveShadow({
    currentCohortRoundId: 119,
    currentRewardWei: b3tr(200),
    currentPricingCapacityWei: b3tr(800),
    currentStressRecipients: 4,
    observedPoolBalanceWei: b3tr(10000),
    reservedExistingWei: '0',
    cohorts: [
      {
        rewardCohortRoundId: 117,
        allocationReceiptId: '30',
        officialAllocationWei: b3tr(2000),
        promotionFundingWei: '0',
        committedWei: '0',
        lateRewardWei: b3tr(250),
        queuedEligibleCount: 2,
        lateParticipants: [],
      },
    ],
  });

  assert.equal(result.queuedEligibleCount, 2);
  assert.equal(result.lateCompletionProtectedRecipients, 2);
  assert.equal(result.lateCompletionWeightedLiabilityWei, b3tr(500));
  assert.equal(result.lateCompletionStressExtraWei, '0');
  assert.equal(result.bankStressReserveWei, '0');
  assert.equal(result.lateCompletionProtectedWei, b3tr(500));
  assert.equal(result.cohorts[0].sweepableWei, b3tr(1500));
  assert.equal(result.bankDepositWei, b3tr(1500));
});
