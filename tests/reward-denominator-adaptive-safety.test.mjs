import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculatePredictiveRewardPolicy } from '../src/lib/rewards/predictivePolicy.ts';

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

test('historical fixed reservations retain their minimum three-recipient safety floor', () => {
  const actual = snapshot(funds);
  assert.equal(actual.stressCompletions, 3);
  assert.equal(actual.rewardPerInviteWei, (funds / 3n).toString());
});

test('later eligible recipients grow the denominator without spending outstanding cohort rights', () => {
  const first = snapshot(funds);
  const queued = snapshot(funds, { ...empty, queuedEligibleCount: 2, activatedZeroCount: 0 });
  assert.ok(queued.stressCompletions >= 4);
  assert.ok(BigInt(queued.rewardPerInviteWei) < BigInt(first.rewardPerInviteWei));
  let remainder = funds;
  for (let i = 0; i < 12; i++) {
    const policy = snapshot(remainder);
    const payable = BigInt(policy.rewardPerInviteWei);
    assert.ok(payable > 0n && payable <= remainder);
    remainder -= payable;
  }
  assert.ok(remainder >= 0n);
});

test('zero physical headroom cannot inflate a fixed reward', () => {
  const dry = calculatePredictiveRewardPolicy({
    latestAllocationWei: funds.toString(), fundingAdjustmentWei: '0',
    cohortReservedWei: '0', reservedExistingWei: funds.toString(),
    observedPoolBalanceWei: funds.toString(), pipeline: empty,
  });
  assert.equal(dry.rewardPerInviteWei, '0');
  const normal = snapshot(funds);
  assert.ok(BigInt(normal.rewardPerInviteWei) * 3n <= funds);
});
