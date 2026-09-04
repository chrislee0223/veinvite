import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateRewardForecastPolicy } from '../src/lib/rewards/rewardForecastPolicy.ts';
import { calculatePredictiveRewardPolicy } from '../src/lib/rewards/predictivePolicy.ts';

function round114FixedPricing() {
  return calculatePredictiveRewardPolicy({
    latestAllocationWei: '886443514655334727680',
    fundingAdjustmentWei: '1217330000000000000000',
    cohortReservedWei: '0',
    observedPoolBalanceWei: '2103770000000000000000',
    reservedExistingWei: '0',
    pipeline: {
      queuedEligibleCount: 0,
      voteReadyCount: 1,
      vot3ReadyCount: 1,
      appsTwoCount: 0,
      appsOneCount: 0,
      activatedZeroCount: 5,
      pendingAcceptanceCount: 0,
    },
  });
}

function round114PublicForecast({
  pendingAcceptanceExpectedBps,
  pendingAcceptanceStressBps,
}) {
  return calculateRewardForecastPolicy({
    officialAllocationWei: '886443514655334727680',
    fundingAdjustmentWei: '1217330000000000000000',
    cohortReservedWei: '0',
    observedPoolBalanceWei: '2103770000000000000000',
    reservedExistingWei: '0',
    allocationSampleCount: 1,
    pipeline: {
      queuedEligibleCount: 0,
      voteReadyCount: 1,
      vot3ReadyCount: 1,
      appsTwoCount: 0,
      appsOneCount: 0,
      activatedZeroCount: 5,
      pendingAcceptanceExpectedBps,
      pendingAcceptanceStressBps,
    },
    completedRewardRoundRecipientCounts: [],
  });
}

test('round 114 live forecast stays aligned after pending invites age', () => {
  const publicForecast = round114PublicForecast({
    pendingAcceptanceExpectedBps: 8750,
    pendingAcceptanceStressBps: 20950,
  });
  const fixedPricing = round114FixedPricing();

  assert.equal(publicForecast.expectedRecipients, 8);
  assert.equal(fixedPricing.stressCompletions, 8);
  assert.equal(publicForecast.estimatedRewardWei, fixedPricing.rewardPerInviteWei);
  assert.equal(publicForecast.estimatedRewardWei, '262971250000000000000');
});

test('aging pending invites cannot raise the midpoint above fixed reservation pricing', () => {
  const publicForecast = round114PublicForecast({
    pendingAcceptanceExpectedBps: 0,
    pendingAcceptanceStressBps: 0,
  });
  const fixedPricing = round114FixedPricing();

  assert.equal(publicForecast.expectedRecipients, 8);
  assert.equal(fixedPricing.stressCompletions, 8);
  assert.equal(publicForecast.estimatedRewardWei, fixedPricing.rewardPerInviteWei);
});
