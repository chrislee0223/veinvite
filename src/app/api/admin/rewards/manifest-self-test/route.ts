import { NextResponse } from 'next/server';

import {
  buildPayoutManifest,
  decodePayoutClause,
} from '@/lib/rewards/payoutManifest';
import { VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';

function isProductionDeployment() {
  return process.env.VERCEL_ENV === 'production';
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
    throw new Error(
      `${message}: expected function to throw`,
    );
  }
}

export async function GET() {
  if (isProductionDeployment()) {
    return NextResponse.json(
      {
        error:
          'Payout manifest self-test is disabled in Production.',
      },
      { status: 403 },
    );
  }

  const poolAddress =
    '0x6bee7ddab6c99d5b2af0554eaea484ce18f52631';
  const walletOne =
    '0x0000000000000000000000000000000000000011';
  const walletTwo =
    '0x0000000000000000000000000000000000000022';
  const round = {
    id: '77',
    network: 'mainnet',
    app_id: VEINVITE_APP_ID,
    status: 'CREATED',
    distributable_wei: '3000000000000000000',
    eligible_count: 2,
  };
  const payouts = [
    {
      id: '20',
      invite_code: 'TESTB2',
      recipient_wallet: walletTwo,
      amount_wei: '2000000000000000000',
      status: 'PENDING',
      tx_id: null,
    },
    {
      id: '10',
      invite_code: 'TESTA1',
      recipient_wallet: walletOne,
      amount_wei: '1000000000000000000',
      status: 'PENDING',
      tx_id: null,
    },
  ];

  try {
    const first = buildPayoutManifest({
      round,
      payouts,
      x2EarnRewardsPoolAddress:
        poolAddress,
    });
    const second = buildPayoutManifest({
      round,
      payouts: [...payouts].reverse(),
      x2EarnRewardsPoolAddress:
        poolAddress,
    });

    expectEqual(
      first.manifestHash,
      second.manifestHash,
      'manifest hash must be deterministic regardless of input row order',
    );
    expectEqual(
      first.payoutCount,
      2,
      'payout count',
    );
    expectEqual(
      first.totalAmountWei,
      '3000000000000000000',
      'total amount',
    );
    expectEqual(
      first.clauses[0]?.payoutId,
      '10',
      'clauses must be ordered by payout id',
    );
    expectEqual(
      first.clauses[1]?.payoutId,
      '20',
      'second clause payout id',
    );

    for (const clause of first.clauses) {
      const decoded =
        decodePayoutClause(clause.data);

      expectEqual(
        decoded.appId,
        VEINVITE_APP_ID,
        `clause ${clause.payoutId} app id`,
      );
      expectEqual(
        decoded.amountWei,
        clause.amountWei,
        `clause ${clause.payoutId} amount`,
      );
      expectEqual(
        decoded.recipientWallet,
        clause.recipientWallet,
        `clause ${clause.payoutId} recipient`,
      );
      expectEqual(
        decoded.proof,
        '',
        `clause ${clause.payoutId} proof`,
      );
      expectEqual(
        clause.to,
        poolAddress,
        `clause ${clause.payoutId} contract`,
      );
      expectEqual(
        clause.value,
        '0x0',
        `clause ${clause.payoutId} VET value`,
      );
    }

    expectThrows(
      () =>
        buildPayoutManifest({
          round,
          payouts: [
            payouts[0],
            {
              ...payouts[0],
              recipient_wallet:
                walletOne,
            },
          ],
          x2EarnRewardsPoolAddress:
            poolAddress,
        }),
      'duplicate payout id must fail closed',
    );

    expectThrows(
      () =>
        buildPayoutManifest({
          round,
          payouts: [
            payouts[0],
            {
              ...payouts[1],
              status: 'SENDING',
            },
          ],
          x2EarnRewardsPoolAddress:
            poolAddress,
        }),
      'non-PENDING payout must fail closed',
    );

    expectThrows(
      () =>
        buildPayoutManifest({
          round: {
            ...round,
            distributable_wei:
              '4000000000000000000',
          },
          payouts,
          x2EarnRewardsPoolAddress:
            poolAddress,
        }),
      'round total mismatch must fail closed',
    );

    return NextResponse.json(
      {
        mode: 'PREVIEW_SELF_TEST',
        passed: true,
        manifestHash:
          first.manifestHash,
        payoutCount:
          first.payoutCount,
        totalAmountWei:
          first.totalAmountWei,
        clauses:
          first.clauses.map((clause) => ({
            payoutId: clause.payoutId,
            recipientWallet:
              clause.recipientWallet,
            amountWei: clause.amountWei,
            to: clause.to,
            value: clause.value,
          })),
        writesPerformed: false,
        transactionSubmitted: false,
        transfersPerformed: false,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        mode: 'PREVIEW_SELF_TEST',
        passed: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown payout manifest self-test failure.',
        writesPerformed: false,
        transactionSubmitted: false,
        transfersPerformed: false,
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
        },
      },
    );
  }
}
