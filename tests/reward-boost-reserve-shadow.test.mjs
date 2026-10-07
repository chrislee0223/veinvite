import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateRewardBoostReserveShadow,
  REWARD_BOOST_RESERVE_LONG_INCOMPLETE_ROUNDS,
  REWARD_BOOST_RESERVE_SAFETY_BUFFER_BPS,
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
        lateParticipants: [],
      },
      {
        rewardCohortRoundId: 118,
        allocationReceiptId: '2',
        officialAllocationWei: b3tr(1000),
        promotionFundingWei: '0',
        committedWei: '0',
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
        lateParticipants: [],
      },
    ],
  });

  assert.equal(result.reusableOfficialWei, b3tr(900));
  assert.equal(result.reusablePromotionWei, b3tr(700));
  assert.equal(result.reusableGrossWei, b3tr(1600));
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

  // Weighted expectation is 2.45 users, rounded up to 3, plus one stress user.
  assert.equal(result.longIncompleteCount, 5);
  assert.equal(result.lateCompletionProtectedRecipients, 4);
  assert.equal(result.lateCompletionProtectedWei, b3tr(800));
  assert.equal(result.reusableAfterLateProtectionWei, b3tr(2200));
});

test('15 percent physical safety buffer is protected from boost use', () => {
  const result = calculateRewardBoostReserveShadow({
    currentCohortRoundId: 119,
    currentRewardWei: b3tr(200),
    currentPricingCapacityWei: b3tr(800),
    currentStressRecipients: 4,
    observedPoolBalanceWei: b3tr(1000),
    reservedExistingWei: b3tr(200),
    cohorts: [
      {
        rewardCohortRoundId: 117,
        allocationReceiptId: '4',
        officialAllocationWei: b3tr(1000),
        promotionFundingWei: '0',
        committedWei: '0',
        lateParticipants: [],
      },
    ],
  });

  assert.equal(
    result.safetyBufferBps,
    REWARD_BOOST_RESERVE_SAFETY_BUFFER_BPS,
  );
  assert.equal(result.physicalUnreservedPoolWei, b3tr(800));
  assert.equal(result.safetyBufferWei, b3tr(120));
  assert.equal(result.physicalBoostCapacityWei, b3tr(680));
  assert.equal(result.boostAvailableWei, b3tr(680));
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
        lateParticipants: [],
      },
    ],
  });

  assert.equal(result.boostAvailableWei, b3tr(5000));
  assert.equal(result.balancedBoostReleaseWei, b3tr(800));
  assert.equal(result.shadowBalancedRewardWei, b3tr(400));
});
