import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculatePredictiveRewardPolicy,
  PREDICTIVE_REWARD_ALGORITHM_VERSION,
} from '../src/lib/rewards/predictivePolicy.ts';

const EMPTY_PIPELINE = {
  queuedEligibleCount: 0,
  voteReadyCount: 0,
  vot3ReadyCount: 0,
  appsTwoCount: 0,
  appsOneCount: 0,
  activatedZeroCount: 0,
  pendingAcceptanceCount: 0,
};

function policy(overrides = {}) {
  return calculatePredictiveRewardPolicy({
    latestAllocationWei: '8000',
    fundingAdjustmentWei: '0',
    cohortReservedWei: '0',
    observedPoolBalanceWei: '8000',
    reservedExistingWei: '0',
    pipeline: EMPTY_PIPELINE,
    ...overrides,
  });
}

test('uses a conservative minimum denominator before users complete', () => {
  const result = policy();

  assert.equal(result.algorithmVersion, PREDICTIVE_REWARD_ALGORITHM_VERSION);
  assert.equal(result.expectedCompletions, 0);
  assert.equal(result.stressCompletions, 4);
  assert.equal(result.rewardPerInviteWei, '2000');
  assert.equal(result.maxImmediatelyPayableCount, '4');
});

test('near-complete users increase the stress denominator and lower fixed reward', () => {
  const result = policy({
    pipeline: {
      ...EMPTY_PIPELINE,
      queuedEligibleCount: 1,
      voteReadyCount: 2,
    },
  });

  assert.equal(result.expectedCompletions, 3);
  assert.equal(result.stressCompletions, 6);
  assert.equal(result.rewardPerInviteWei, '1333');
});

test('unrelated carry-over reserve increases physical capacity without inflating cohort reward', () => {
  const withoutReserve = policy();
  const withReserve = policy({ observedPoolBalanceWei: '16000' });

  assert.equal(withReserve.rewardPerInviteWei, withoutReserve.rewardPerInviteWei);
  assert.equal(withReserve.pricingBasisWei, '8000');
});

test('an audited cohort promotion increases this cohort actual pricing basis', () => {
  const result = policy({
    fundingAdjustmentWei: '4000',
    observedPoolBalanceWei: '12000',
  });

  assert.equal(result.designatedBudgetWei, '12000');
  assert.equal(result.pricingBasisWei, '12000');
  assert.equal(result.rewardPerInviteWei, '3000');
});

test('global unsettled liabilities cap physical pricing capacity', () => {
  const result = policy({
    observedPoolBalanceWei: '10000',
    reservedExistingWei: '4000',
  });

  assert.equal(result.availablePoolWei, '6000');
  assert.equal(result.pricingBasisWei, '6000');
  assert.equal(result.rewardPerInviteWei, '1500');
});

test('existing reservations from the same cohort reduce its remaining budget', () => {
  const result = policy({
    cohortReservedWei: '2000',
    reservedExistingWei: '2000',
  });

  assert.equal(result.cohortAvailableBudgetWei, '6000');
  assert.equal(result.availablePoolWei, '6000');
  assert.equal(result.rewardPerInviteWei, '1500');
});

test('does not invent a reward with no designated funding or no available pool', () => {
  const noFunding = policy({
    latestAllocationWei: '0',
    fundingAdjustmentWei: '0',
    observedPoolBalanceWei: '10000',
  });
  const noPool = policy({
    observedPoolBalanceWei: '1000',
    reservedExistingWei: '1000',
  });

  assert.equal(noFunding.rewardPerInviteWei, '0');
  assert.equal(noPool.rewardPerInviteWei, '0');
});

test('fails closed on malformed accounting or pipeline data', () => {
  assert.throws(
    () => policy({ latestAllocationWei: '8.5' }),
    /latestAllocationWei/,
  );

  assert.throws(
    () => policy({
      pipeline: {
        ...EMPTY_PIPELINE,
        voteReadyCount: -1,
      },
    }),
    /voteReadyCount/,
  );
});
