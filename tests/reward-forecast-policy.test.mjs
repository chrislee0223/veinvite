import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateRewardForecastPolicy,
  REWARD_FORECAST_MODEL_VERSION,
} from '../src/lib/rewards/rewardForecastPolicy.ts';

const EMPTY_PIPELINE = {
  queuedEligibleCount: 0,
  voteReadyCount: 0,
  vot3ReadyCount: 0,
  appsTwoCount: 0,
  appsOneCount: 0,
  activatedZeroCount: 0,
  pendingAcceptanceExpectedBps: 0,
  pendingAcceptanceStressBps: 0,
};

function forecast(overrides = {}) {
  return calculateRewardForecastPolicy({
    officialAllocationWei: '8000',
    fundingAdjustmentWei: '0',
    cohortReservedWei: '0',
    observedPoolBalanceWei: '8000',
    reservedExistingWei: '0',
    allocationSampleCount: 1,
    pipeline: EMPTY_PIPELINE,
    completedRewardRoundRecipientCounts: [],
    ...overrides,
  });
}

test('uses known current-cohort funding with a six-recipient bootstrap center', () => {
  const result = forecast();

  assert.equal(result.modelVersion, REWARD_FORECAST_MODEL_VERSION);
  assert.equal(result.designatedBudgetWei, '8000');
  assert.equal(result.pricingCapacityWei, '8000');
  assert.equal(result.expectedRecipients, 6);
  assert.equal(result.recipientLow, 4);
  assert.equal(result.recipientHigh, 8);
  assert.equal(result.estimatedRewardWei, '1333');
  assert.equal(result.estimatedRewardLowWei, '1000');
  assert.equal(result.estimatedRewardHighWei, '2000');
});

test('VOT3-ready users carry the agreed 90 percent expected completion weight', () => {
  const result = forecast({
    pipeline: {
      ...EMPTY_PIPELINE,
      vot3ReadyCount: 10,
    },
  });

  // 10 VOT3-ready users contribute 9 expected recipients at the agreed 90%.
  assert.equal(result.pipelineExpectedRecipients, 9);
  // The public midpoint then respects the same conservative stress floor used
  // by completion-time fixed reservations instead of overstating the reward.
  assert.equal(result.expectedRecipients, 14);
});

test('a separately recorded cohort promotion increases this cohort estimate', () => {
  const result = forecast({
    fundingAdjustmentWei: '2000',
    observedPoolBalanceWei: '10000',
  });

  assert.equal(result.officialAllocationWei, '8000');
  assert.equal(result.fundingAdjustmentWei, '2000');
  assert.equal(result.designatedBudgetWei, '10000');
  assert.equal(result.estimatedRewardWei, '1666');
});

test('unrelated carry-over pool balance does not inflate cohort pricing', () => {
  const result = forecast({
    observedPoolBalanceWei: '16000',
  });

  assert.equal(result.designatedBudgetWei, '8000');
  assert.equal(result.pricingCapacityWei, '8000');
  assert.equal(result.estimatedRewardWei, '1333');
});

test('existing cohort reservations reduce remaining cohort pricing capacity', () => {
  const result = forecast({
    observedPoolBalanceWei: '10000',
    reservedExistingWei: '2000',
    cohortReservedWei: '2000',
  });

  assert.equal(result.pricingCapacityWei, '6000');
  assert.equal(result.estimatedRewardWei, '1000');
});

test('near-complete cohort users lower the displayed estimate', () => {
  const baseline = forecast();
  const busy = forecast({
    pipeline: {
      ...EMPTY_PIPELINE,
      voteReadyCount: 5,
    },
  });

  assert.ok(busy.expectedRecipients > baseline.expectedRecipients);
  assert.ok(BigInt(busy.estimatedRewardWei) < BigInt(baseline.estimatedRewardWei));
});

test('actual recipient history gradually replaces the bootstrap center', () => {
  const result = forecast({
    completedRewardRoundRecipientCounts: [10, 10, 10, 10, 10, 10],
  });

  assert.equal(result.recipientHistoryRoundCount, 6);
  assert.equal(result.expectedRecipients, 9);
  assert.equal(result.estimatedRewardWei, '888');
});

test('allocation sample count is retained as learning metadata without repricing known funding', () => {
  const oneSample = forecast({ allocationSampleCount: 1 });
  const eightSamples = forecast({ allocationSampleCount: 8 });

  assert.equal(oneSample.allocationSampleCount, 1);
  assert.equal(eightSamples.allocationSampleCount, 8);
  assert.equal(oneSample.estimatedRewardWei, eightSamples.estimatedRewardWei);
});

test('fails closed on malformed values', () => {
  assert.throws(
    () => forecast({ officialAllocationWei: '8.5' }),
    /officialAllocationWei/,
  );

  assert.throws(
    () => forecast({
      pipeline: {
        ...EMPTY_PIPELINE,
        voteReadyCount: -1,
      },
    }),
    /voteReadyCount/,
  );
});
