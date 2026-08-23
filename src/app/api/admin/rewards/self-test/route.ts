import { NextResponse } from 'next/server';

import {
  calculateRewardDryRun,
  type ExistingRewardPayout,
  type RewardCandidate,
} from '@/lib/rewards/dryRun';

function isProductionDeployment() {
  return process.env.VERCEL_ENV === 'production';
}

function wallet(seed: string) {
  return `0x${seed.padStart(40, '0').slice(-40)}`;
}

function candidate(
  inviteCode: string,
  seed: string,
  eligibleAt: string | null = '2026-08-23T00:00:00.000Z',
): RewardCandidate {
  return {
    inviteCode,
    recipientWallet: wallet(seed),
    eligibleAt,
  };
}

function payout(
  inviteCode: string,
  amountWei: string,
  status: ExistingRewardPayout['status'],
): ExistingRewardPayout {
  return {
    inviteCode,
    amountWei,
    status,
  };
}

function expectEqual(
  actual: unknown,
  expected: unknown,
  message: string,
) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function expectThrows(
  run: () => unknown,
  message: string,
) {
  let threw = false;

  try {
    run();
  } catch {
    threw = true;
  }

  if (!threw) {
    throw new Error(`${message}: expected function to throw`);
  }
}

export async function GET() {
  if (isProductionDeployment()) {
    return NextResponse.json(
      { error: 'Reward self-test is disabled in Production.' },
      { status: 403 },
    );
  }

  const results: Array<{
    name: string;
    passed: boolean;
    error?: string;
  }> = [];

  const test = (name: string, run: () => void) => {
    try {
      run();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({
        name,
        passed: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown test failure',
      });
    }
  };

  test('zero eligible users', () => {
    const result = calculateRewardDryRun({
      poolBalanceWei: '100',
      candidates: [],
      existingPayouts: [],
    });

    expectEqual(result.eligibleCount, 0, 'eligibleCount');
    expectEqual(result.distributableWei, '0', 'distributableWei');
    expectEqual(result.remainderWei, '100', 'remainderWei');
    expectEqual(result.payouts.length, 0, 'payout count');
  });

  test('single eligible user receives full available pool', () => {
    const result = calculateRewardDryRun({
      poolBalanceWei: '100',
      candidates: [candidate('A1', '1')],
      existingPayouts: [],
    });

    expectEqual(result.perRewardWei, '100', 'perRewardWei');
    expectEqual(result.distributableWei, '100', 'distributableWei');
    expectEqual(result.remainderWei, '0', 'remainderWei');
    expectEqual(result.payouts[0]?.amountWei, '100', 'payout amount');
  });

  test('three users split equally and keep integer remainder', () => {
    const result = calculateRewardDryRun({
      poolBalanceWei: '100',
      candidates: [
        candidate('A1', '1'),
        candidate('A2', '2'),
        candidate('A3', '3'),
      ],
      existingPayouts: [],
    });

    expectEqual(result.perRewardWei, '33', 'perRewardWei');
    expectEqual(result.distributableWei, '99', 'distributableWei');
    expectEqual(result.remainderWei, '1', 'remainderWei');
    expectEqual(result.payouts.length, 3, 'payout count');
  });

  test('pending payout is reserved before new distribution', () => {
    const result = calculateRewardDryRun({
      poolBalanceWei: '100',
      candidates: [candidate('B2', '2')],
      existingPayouts: [payout('OLD1', '40', 'PENDING')],
    });

    expectEqual(result.reservedExistingWei, '40', 'reservedExistingWei');
    expectEqual(result.availableToReserveWei, '60', 'availableToReserveWei');
    expectEqual(result.perRewardWei, '60', 'perRewardWei');
  });

  test('failed payout remains reserved', () => {
    const result = calculateRewardDryRun({
      poolBalanceWei: '100',
      candidates: [candidate('B2', '2')],
      existingPayouts: [payout('OLD1', '25', 'FAILED')],
    });

    expectEqual(result.reservedExistingWei, '25', 'reservedExistingWei');
    expectEqual(result.perRewardWei, '75', 'perRewardWei');
  });

  test('paid payout is not reserved but invite cannot be rewarded twice', () => {
    const result = calculateRewardDryRun({
      poolBalanceWei: '100',
      candidates: [
        candidate('PAID1', '1'),
        candidate('NEW1', '2'),
      ],
      existingPayouts: [payout('PAID1', '40', 'PAID')],
    });

    expectEqual(result.reservedExistingWei, '0', 'reservedExistingWei');
    expectEqual(result.eligibleCount, 1, 'eligibleCount');
    expectEqual(result.payouts[0]?.inviteCode, 'NEW1', 'remaining invite');
    expectEqual(result.payouts[0]?.amountWei, '100', 'remaining payout');
  });

  test('reserved amount greater than pool produces no new payouts', () => {
    const result = calculateRewardDryRun({
      poolBalanceWei: '50',
      candidates: [candidate('NEW1', '2')],
      existingPayouts: [payout('OLD1', '80', 'SENDING')],
    });

    expectEqual(result.availableToReserveWei, '0', 'availableToReserveWei');
    expectEqual(result.distributableWei, '0', 'distributableWei');
    expectEqual(result.payouts.length, 0, 'payout count');
  });

  test('duplicate reward candidate is rejected', () => {
    expectThrows(
      () =>
        calculateRewardDryRun({
          poolBalanceWei: '100',
          candidates: [
            candidate('DUP1', '1'),
            candidate('dup1', '2'),
          ],
          existingPayouts: [],
        }),
      'duplicate candidate validation',
    );
  });

  test('invalid wallet is rejected', () => {
    expectThrows(
      () =>
        calculateRewardDryRun({
          poolBalanceWei: '100',
          candidates: [
            {
              inviteCode: 'BAD1',
              recipientWallet: 'not-a-wallet',
              eligibleAt: null,
            },
          ],
          existingPayouts: [],
        }),
      'wallet validation',
    );
  });

  test('zero pool never creates payouts', () => {
    const result = calculateRewardDryRun({
      poolBalanceWei: '0',
      candidates: [candidate('A1', '1')],
      existingPayouts: [],
    });

    expectEqual(result.availableToReserveWei, '0', 'availableToReserveWei');
    expectEqual(result.payouts.length, 0, 'payout count');
  });

  const failed = results.filter((result) => !result.passed);

  return NextResponse.json(
    {
      mode: 'PREVIEW_SELF_TEST',
      writesPerformed: false,
      transfersPerformed: false,
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results,
    },
    {
      status: failed.length === 0 ? 200 : 500,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
