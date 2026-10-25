import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculatePredictiveRewardPolicy } from '../src/lib/rewards/predictivePolicy.ts';
import { calculateRewardForecastPolicy } from '../src/lib/rewards/rewardForecastPolicy.ts';

const empty = { queuedEligibleCount: 0, voteReadyCount: 0, vot3ReadyCount: 0,
  appsTwoCount: 0, appsOneCount: 0, activatedZeroCount: 1, pendingAcceptanceCount: 0 };
const WEI = 10n ** 18n;
const funds = 1108054393319168409600n;
const snapshot = (remaining, pipeline = empty) => calculatePredictiveRewardPolicy({
  latestAllocationWei: funds.toString(), fundingAdjustmentWei: '0',
  reserveNetFlowWei: '0', cohortReservedWei: (funds - remaining).toString(),
  observedPoolBalanceWei: (funds + 4000n * WEI).toString(),
  reservedExistingWei: (funds - remaining).toString(), pipeline,
});

test('one active current-cohort user: forecast matches exact reservation policy with median-informed floor of three', () => {
  const live = snapshot(funds);
  const estimate = calculateRewardForecastPolicy({
    officialAllocationWei: funds.toString(), fundingAdjustmentWei: '0', reserveNetFlowWei: '0',
    cohortReservedWei: '0', observedPoolBalanceWei: (funds + 4000n * WEI).toString(),
    reservedExistingWei: '0', allocationSampleCount: 8,
    completedRewardRoundRecipientCounts: [5,3,0,1,3,3,2],
    pipeline: { ...empty, pendingAcceptanceExpectedBps: 0, pendingAcceptanceStressBps: 0 },
  });
  assert.equal(live.stressCompletions, 3);
  assert.equal(live.rewardPerInviteWei, (funds / 3n).toString());
  assert.equal(estimate.expectedRecipients, 3);
  assert.equal(estimate.estimatedRewardWei, live.rewardPerInviteWei);
});

test('later eligible recipients grow stress denominator and preserve unpaid cohort balance', () => {
  const first = snapshot(funds);
  const queuedTwo = snapshot(funds, { ...empty, queuedEligibleCount: 2, activatedZeroCount: 0 });
  assert.ok(queuedTwo.stressCompletions >= 4);
  assert.ok(BigInt(queuedTwo.rewardPerInviteWei) < BigInt(first.rewardPerInviteWei));
  let remainder = funds;
  for (let i = 0; i < 12; i++) {
    const policy = snapshot(remainder);
    const payable = BigInt(policy.rewardPerInviteWei);
    assert.ok(payable > 0n, 'later recipients should still have a positive quote');
    assert.ok(payable <= remainder);
    remainder -= payable;
  }
  assert.ok(remainder >= 0n);
});

test('no extra funding, no physical headroom, or invalid liabilities cannot inflate rewards', () => {
  const p = snapshot(funds);
  const noCash = calculatePredictiveRewardPolicy({
    latestAllocationWei: funds.toString(), fundingAdjustmentWei: '0',
    cohortReservedWei: '0', reservedExistingWei: funds.toString(),
    observedPoolBalanceWei: funds.toString(), pipeline: empty,
  });
  assert.equal(noCash.rewardPerInviteWei, '0');
  assert.equal(p.designatedBudgetWei, funds.toString());
  assert.ok(BigInt(p.rewardPerInviteWei) * 3n <= funds);
});
