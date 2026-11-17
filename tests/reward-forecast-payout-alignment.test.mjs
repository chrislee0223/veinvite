import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePredictiveRewardPolicy } from '../src/lib/rewards/predictivePolicy.ts';

test('legacy fixed-reservation pricing retains safety for already-bound historical cohorts', () => {
  const fixed = calculatePredictiveRewardPolicy({
    latestAllocationWei: '886443514655334727680',
    fundingAdjustmentWei: '1217330000000000000000',
    cohortReservedWei: '0',
    observedPoolBalanceWei: '2103770000000000000000',
    reservedExistingWei: '0',
    pipeline: {
      queuedEligibleCount: 0, voteReadyCount: 1, vot3ReadyCount: 1,
      appsTwoCount: 0, appsOneCount: 0, activatedZeroCount: 5,
      pendingAcceptanceCount: 0,
    },
  });
  assert.equal(fixed.stressCompletions, 7);
  assert.equal(fixed.rewardPerInviteWei, (2103770000000000000000n / 7n).toString());
});
