import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateRewardForecastPolicy } from '../src/lib/rewards/rewardForecastPolicy.ts';
import { calculatePredictiveRewardPolicy } from '../src/lib/rewards/predictivePolicy.ts';

test('round 114 representative forecast stays aligned with completion-time pricing', () => {
  const officialAllocationWei = '886443514655334727680';
  const fundingAdjustmentWei = '1217330000000000000000';
  const observedPoolBalanceWei = '2103770000000000000000';

  const publicForecast = calculateRewardForecastPolicy({
    officialAllocationWei,
    fundingAdjustmentWei,
    cohortReservedWei: '0',
    observedPoolBalanceWei,
    reservedExistingWei: '0',
    allocationSampleCount: 1,
    pipeline: {
      queuedEligibleCount: 0,
      voteReadyCount: 1,
      vot3ReadyCount: 1,
      appsTwoCount: 0,
      appsOneCount: 0,
      activatedZeroCount: 5,
      pendingAcceptanceExpectedBps: 9250,
      pendingAcceptanceStressBps: 21850,
    },
    completedRewardRoundRecipientCounts: [],
  });

  const fixedPricing = calculatePredictiveRewardPolicy({
    latestAllocationWei: officialAllocationWei,
    fundingAdjustmentWei,
    cohortReservedWei: '0',
    observedPoolBalanceWei,
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

  assert.equal(publicForecast.expectedRecipients, 8);
  assert.equal(fixedPricing.stressCompletions, 8);
  assert.equal(publicForecast.estimatedRewardWei, fixedPricing.rewardPerInviteWei);
  assert.equal(publicForecast.estimatedRewardWei, '262971250000000000000');
});
