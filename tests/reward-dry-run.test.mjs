import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateRewardDryRun } from '../src/lib/rewards/dryRun.ts';

const WALLETS = [
  '0x1111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222',
  '0x3333333333333333333333333333333333333333',
  '0x4444444444444444444444444444444444444444',
];

function candidate(inviteCode, recipientWallet, eligibleAt = '2026-08-01T00:00:00.000Z') {
  return { inviteCode, recipientWallet, eligibleAt };
}

test('splits the available pool equally and keeps the integer remainder', () => {
  const result = calculateRewardDryRun({
    poolBalanceWei: '100',
    candidates: [
      candidate('CCC', WALLETS[2], '2026-08-02T00:00:00.000Z'),
      candidate('BBB', WALLETS[1], '2026-08-01T00:00:00.000Z'),
      candidate('AAA', WALLETS[0], '2026-08-01T00:00:00.000Z'),
    ],
    existingPayouts: [],
  });

  assert.equal(result.eligibleCount, 3);
  assert.equal(result.perRewardWei, '33');
  assert.equal(result.distributableWei, '99');
  assert.equal(result.remainderWei, '1');
  assert.deepEqual(
    result.payouts.map((payout) => payout.inviteCode),
    ['AAA', 'BBB', 'CCC'],
  );
});

test('reserves unsettled payouts but not completed payouts', () => {
  const result = calculateRewardDryRun({
    poolBalanceWei: '1000',
    candidates: [candidate('NEW1', WALLETS[3])],
    existingPayouts: [
      { inviteCode: 'OLD1', amountWei: '100', status: 'PENDING' },
      { inviteCode: 'OLD2', amountWei: '50', status: 'SENDING' },
      { inviteCode: 'OLD3', amountWei: '25', status: 'FAILED' },
      { inviteCode: 'OLD4', amountWei: '200', status: 'PAID' },
    ],
  });

  assert.equal(result.reservedExistingWei, '175');
  assert.equal(result.availableToReserveWei, '825');
  assert.equal(result.perRewardWei, '825');
  assert.equal(result.distributableWei, '825');
});

test('never includes an invitation that already has any payout record', () => {
  const result = calculateRewardDryRun({
    poolBalanceWei: '100',
    candidates: [
      candidate('USED', WALLETS[0]),
      candidate('FRESH', WALLETS[1]),
    ],
    existingPayouts: [
      { inviteCode: 'USED', amountWei: '10', status: 'PAID' },
    ],
  });

  assert.equal(result.eligibleCount, 1);
  assert.equal(result.reservedExistingWei, '0');
  assert.equal(result.perRewardWei, '100');
  assert.deepEqual(
    result.payouts.map((payout) => payout.inviteCode),
    ['FRESH'],
  );
});

test('returns no new payouts when existing reservations consume the pool', () => {
  const result = calculateRewardDryRun({
    poolBalanceWei: '10',
    candidates: [candidate('FRESH', WALLETS[0])],
    existingPayouts: [
      { inviteCode: 'OLD1', amountWei: '20', status: 'PENDING' },
    ],
  });

  assert.equal(result.availableToReserveWei, '0');
  assert.equal(result.perRewardWei, '0');
  assert.equal(result.distributableWei, '0');
  assert.deepEqual(result.payouts, []);
});

test('fails closed on duplicate reward candidates', () => {
  assert.throws(
    () => calculateRewardDryRun({
      poolBalanceWei: '100',
      candidates: [
        candidate('DUP', WALLETS[0]),
        candidate('dup', WALLETS[1]),
      ],
      existingPayouts: [],
    }),
    /Duplicate reward candidate invite DUP/,
  );
});

test('fails closed on duplicate existing payout records', () => {
  assert.throws(
    () => calculateRewardDryRun({
      poolBalanceWei: '100',
      candidates: [],
      existingPayouts: [
        { inviteCode: 'DUP', amountWei: '10', status: 'PAID' },
        { inviteCode: 'dup', amountWei: '10', status: 'FAILED' },
      ],
    }),
    /Duplicate existing payout for invite DUP/,
  );
});

test('fails closed on malformed candidate evidence', () => {
  assert.throws(
    () => calculateRewardDryRun({
      poolBalanceWei: '100',
      candidates: [candidate('BADWALLET', '0x1234')],
      existingPayouts: [],
    }),
    /Invalid reward recipient wallet/,
  );

  assert.throws(
    () => calculateRewardDryRun({
      poolBalanceWei: '100',
      candidates: [candidate('BADDATE', WALLETS[0], 'not-a-date')],
      existingPayouts: [],
    }),
    /invalid reward_eligible_at/,
  );
});
