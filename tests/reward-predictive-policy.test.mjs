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

test('uses a conservative minimum denominator even before users complete', () => {
  const policy = calculatePredictiveRewardPolicy({
    latestAllocationWei: '8000',
    observedPoolBalanceWei: '8000',
    reservedExistingWei: '0',
    pipeline: EMPTY_PIPELINE,
  });

  assert.equal(
    policy.algorithmVersion,
    PREDICTIVE_REWARD_ALGORITHM_VERSION,
  );
  assert.equal(policy.expectedCompletions, 0);
  assert.equal(policy.stressCompletions, 4);
  assert.equal(policy.rewardPerInviteWei, '2000');
  assert.equal(policy.maxImmediatelyPayableCount, '4');
});

test('near-complete users increase the stress denominator and lower the safe reward', () => {
  const policy = calculatePredictiveRewardPolicy({
    latestAllocationWei: '8000',
    observedPoolBalanceWei: '8000',
    reservedExistingWei: '0',
    pipeline: {
      ...EMPTY_PIPELINE,
      queuedEligibleCount: 1,
      voteReadyCount: 2,
    },
  });

  assert.equal(policy.expectedCompletions, 3);
  assert.equal(policy.stressCompletions, 6);
  assert.equal(policy.rewardPerInviteWei, '1333');
  assert.equal(policy.projectedReserveAfterStressWei, '2');
});

test('carry-over reserve increases capacity without inflating the current reward', () => {
  const withoutReserve = calculatePredictiveRewardPolicy({
    latestAllocationWei: '8000',
    observedPoolBalanceWei: '8000',
    reservedExistingWei: '0',
    pipeline: {
      ...EMPTY_PIPELINE,
      voteReadyCount: 2,
    },
  });

  const withReserve = calculatePredictiveRewardPolicy({
    latestAllocationWei: '8000',
    observedPoolBalanceWei: '16000',
    reservedExistingWei: '0',
    pipeline: {
      ...EMPTY_PIPELINE,
      voteReadyCount: 2,
    },
  });

  assert.equal(
    withReserve.rewardPerInviteWei,
    withoutReserve.rewardPerInviteWei,
  );
  assert.ok(
    BigInt(withReserve.maxImmediatelyPayableCount) >
      BigInt(withoutReserve.maxImmediatelyPayableCount),
  );
});

test('existing unsettled payouts are reserved before new capacity is calculated', () => {
  const policy = calculatePredictiveRewardPolicy({
    latestAllocationWei: '8000',
    observedPoolBalanceWei: '10000',
    reservedExistingWei: '4000',
    pipeline: EMPTY_PIPELINE,
  });

  assert.equal(policy.availablePoolWei, '6000');
  assert.equal(policy.rewardPerInviteWei, '1500');
  assert.equal(policy.maxImmediatelyPayableCount, '4');
});

test('does not invent a reward when there is no funded allocation or no available pool', () => {
  const noAllocation = calculatePredictiveRewardPolicy({
    latestAllocationWei: '0',
    observedPoolBalanceWei: '10000',
    reservedExistingWei: '0',
    pipeline: EMPTY_PIPELINE,
  });
  const noPool = calculatePredictiveRewardPolicy({
    latestAllocationWei: '8000',
    observedPoolBalanceWei: '1000',
    reservedExistingWei: '1000',
    pipeline: EMPTY_PIPELINE,
  });

  assert.equal(noAllocation.rewardPerInviteWei, '0');
  assert.equal(noPool.rewardPerInviteWei, '0');
});

test('fails closed on malformed accounting or pipeline data', () => {
  assert.throws(
    () => calculatePredictiveRewardPolicy({
      latestAllocationWei: '8.5',
      observedPoolBalanceWei: '100',
      reservedExistingWei: '0',
      pipeline: EMPTY_PIPELINE,
    }),
    /latestAllocationWei/,
  );

  assert.throws(
    () => calculatePredictiveRewardPolicy({
      latestAllocationWei: '100',
      observedPoolBalanceWei: '100',
      reservedExistingWei: '0',
      pipeline: {
        ...EMPTY_PIPELINE,
        voteReadyCount: -1,
      },
    }),
    /voteReadyCount/,
  );
});
