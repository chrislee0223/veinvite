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

test('uses a six-recipient bootstrap center with a conservative range', () => {
  const forecast = calculateRewardForecastPolicy({
    recentAllocationWeiNewestFirst: ['8000'],
    observedPoolBalanceWei: '8000',
    reservedExistingWei: '0',
    pipeline: EMPTY_PIPELINE,
    completedRewardRoundRecipientCounts: [],
  });

  assert.equal(forecast.modelVersion, REWARD_FORECAST_MODEL_VERSION);
  assert.equal(forecast.expectedRecipients, 6);
  assert.equal(forecast.recipientLow, 4);
  assert.equal(forecast.recipientHigh, 8);
  assert.equal(forecast.estimatedRewardWei, '1333');
  assert.equal(forecast.estimatedRewardLowWei, '750');
  assert.equal(forecast.estimatedRewardHighWei, '2500');
});

test('near-complete pipeline users lower the displayed estimate', () => {
  const baseline = calculateRewardForecastPolicy({
    recentAllocationWeiNewestFirst: ['8000'],
    observedPoolBalanceWei: '8000',
    reservedExistingWei: '0',
    pipeline: EMPTY_PIPELINE,
    completedRewardRoundRecipientCounts: [],
  });
  const busy = calculateRewardForecastPolicy({
    recentAllocationWeiNewestFirst: ['8000'],
    observedPoolBalanceWei: '8000',
    reservedExistingWei: '0',
    pipeline: {
      ...EMPTY_PIPELINE,
      voteReadyCount: 5,
    },
    completedRewardRoundRecipientCounts: [],
  });

  assert.ok(busy.expectedRecipients > baseline.expectedRecipients);
  assert.ok(BigInt(busy.estimatedRewardWei) < BigInt(baseline.estimatedRewardWei));
});

test('allocation history becomes a weighted next-round estimate', () => {
  const forecast = calculateRewardForecastPolicy({
    recentAllocationWeiNewestFirst: ['12000', '9000', '6000'],
    observedPoolBalanceWei: '12000',
    reservedExistingWei: '0',
    pipeline: EMPTY_PIPELINE,
    completedRewardRoundRecipientCounts: [],
  });

  assert.equal(forecast.allocationSampleCount, 3);
  assert.equal(forecast.projectedAllocationWei, '10000');
  assert.equal(forecast.projectedAllocationLowWei, '8500');
  assert.equal(forecast.projectedAllocationHighWei, '11500');
});

test('actual recipient history gradually replaces the bootstrap center', () => {
  const forecast = calculateRewardForecastPolicy({
    recentAllocationWeiNewestFirst: ['8000'],
    observedPoolBalanceWei: '8000',
    reservedExistingWei: '0',
    pipeline: EMPTY_PIPELINE,
    completedRewardRoundRecipientCounts: [10, 10, 10, 10, 10, 10],
  });

  assert.equal(forecast.recipientHistoryRoundCount, 6);
  assert.equal(forecast.expectedRecipients, 9);
  assert.equal(forecast.estimatedRewardWei, '888');
});

test('unsettled reservations cannot create extra pricing capacity', () => {
  const forecast = calculateRewardForecastPolicy({
    recentAllocationWeiNewestFirst: ['8000'],
    observedPoolBalanceWei: '1000',
    reservedExistingWei: '4000',
    pipeline: EMPTY_PIPELINE,
    completedRewardRoundRecipientCounts: [],
  });

  assert.equal(forecast.pricingCapacityWei, '8000');
  assert.equal(forecast.estimatedRewardWei, '1333');
});

test('fails closed on malformed values', () => {
  assert.throws(
    () => calculateRewardForecastPolicy({
      recentAllocationWeiNewestFirst: ['8.5'],
      observedPoolBalanceWei: '100',
      reservedExistingWei: '0',
      pipeline: EMPTY_PIPELINE,
      completedRewardRoundRecipientCounts: [],
    }),
    /recentAllocationWeiNewestFirst/,
  );

  assert.throws(
    () => calculateRewardForecastPolicy({
      recentAllocationWeiNewestFirst: ['100'],
      observedPoolBalanceWei: '100',
      reservedExistingWei: '0',
      pipeline: {
        ...EMPTY_PIPELINE,
        voteReadyCount: -1,
      },
      completedRewardRoundRecipientCounts: [],
    }),
    /voteReadyCount/,
  );
});
