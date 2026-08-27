import {
  NextResponse,
} from 'next/server';
import { Interface } from 'ethers';

import {
  buildPayoutManifest,
} from '@/lib/rewards/payoutManifest';
import {
  type FinalizedRewardTransactionEvidence,
  RewardTransactionVerificationError,
  verifyPayoutTransactionEvidence,
} from '@/lib/rewards/transactionVerification';

const poolAddress =
  '0x6bee7ddab6c99d5b2af0554eaea484ce18f52631';
const operatorWallet =
  '0x52b4546c45267f33ca79b47abc1863d853bf8917';
const appId =
  '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';

const eventInterface = new Interface([
  'event RewardDistributed(uint256 amount,bytes32 indexed appId,address indexed receiver,string proof,address indexed distributor)',
]);

function rewardEvent(
  amountWei: string,
  recipient: string,
) {
  const event =
    eventInterface.getEvent(
      'RewardDistributed',
    );

  if (!event) {
    throw new Error(
      'RewardDistributed event unavailable.',
    );
  }

  const encoded =
    eventInterface.encodeEventLog(
      event,
      [
        amountWei,
        appId,
        recipient,
        '',
        operatorWallet,
      ],
    );

  return {
    address: poolAddress,
    topics: encoded.topics.map(
      (topic) => topic.toLowerCase(),
    ),
    data: encoded.data.toLowerCase(),
  };
}

function expectVerificationError(
  code: RewardTransactionVerificationError['code'],
  run: () => unknown,
): boolean {
  try {
    run();
    return false;
  } catch (error) {
    return (
      error instanceof
        RewardTransactionVerificationError &&
      error.code === code
    );
  }
}

export async function GET() {
  if (
    process.env.VERCEL_ENV ===
      'production'
  ) {
    return NextResponse.json(
      {
        error:
          'Payout transaction verification self-test is disabled in Production.',
      },
      { status: 403 },
    );
  }

  try {
    const manifest = buildPayoutManifest({
      round: {
        id: '77',
        network: 'mainnet',
        app_id: appId,
        status: 'CREATED',
        distributable_wei:
          '3000000000000000000',
        eligible_count: 2,
      },
      payouts: [
        {
          id: '10',
          invite_code: 'TESTA001',
          recipient_wallet:
            '0x0000000000000000000000000000000000000011',
          amount_wei:
            '1000000000000000000',
          status: 'PENDING',
          tx_id: null,
        },
        {
          id: '20',
          invite_code: 'TESTB002',
          recipient_wallet:
            '0x0000000000000000000000000000000000000022',
          amount_wei:
            '2000000000000000000',
          status: 'PENDING',
          tx_id: null,
        },
      ],
      x2EarnRewardsPoolAddress:
        poolAddress,
    });

    const blockTimestamp = 1_800_000_000;

    const evidence:
      FinalizedRewardTransactionEvidence = {
        txId:
          `0x${'11'.repeat(32)}`,
        txOrigin: operatorWallet,
        blockId:
          `0x${'22'.repeat(32)}`,
        blockNumber: 500,
        blockTimestamp,
        finalizedHeadId:
          `0x${'33'.repeat(32)}`,
        finalizedHeadNumber: 700,
        clauses: manifest.clauses.map(
          (clause) => ({
            to: clause.to,
            value: '0',
            data: clause.data,
          }),
        ),
        outputs: manifest.clauses.map(
          (clause) => ({
            events: [
              rewardEvent(
                clause.amountWei,
                clause.recipientWallet,
              ),
            ],
          }),
        ),
        reverted: false,
      };

    const verified =
      verifyPayoutTransactionEvidence({
        manifest,
        operatorWallet,
        manifestCreatedAt:
          new Date(
            (blockTimestamp - 10) *
              1000,
          ),
        evidence,
      });

    const wrongClause = {
      ...evidence,
      clauses: evidence.clauses.map(
        (clause, index) =>
          index === 0
            ? {
                ...clause,
                data: `${clause.data.slice(
                  0,
                  -2,
                )}00`,
              }
            : clause,
      ),
    };

    const wrongEvent = {
      ...evidence,
      outputs: evidence.outputs.map(
        (output, index) =>
          index === 0
            ? {
                events: [
                  rewardEvent(
                    '999000000000000000000',
                    manifest.clauses[0]
                      ?.recipientWallet ??
                      '0x0000000000000000000000000000000000000011',
                  ),
                ],
              }
            : output,
      ),
    };

    const checks = {
      exactManifestPasses:
        verified.txId === evidence.txId &&
        verified.payoutCount === 2 &&
        verified.totalAmountWei ===
          manifest.totalAmountWei,
      revertedFails:
        expectVerificationError(
          'TX_REVERTED',
          () =>
            verifyPayoutTransactionEvidence({
              manifest,
              operatorWallet,
              manifestCreatedAt:
                new Date(
                  (blockTimestamp - 10) *
                    1000,
                ),
              evidence: {
                ...evidence,
                reverted: true,
              },
            }),
        ),
      wrongOperatorFails:
        expectVerificationError(
          'TX_OPERATOR_MISMATCH',
          () =>
            verifyPayoutTransactionEvidence({
              manifest,
              operatorWallet,
              manifestCreatedAt:
                new Date(
                  (blockTimestamp - 10) *
                    1000,
                ),
              evidence: {
                ...evidence,
                txOrigin:
                  '0x0000000000000000000000000000000000000099',
              },
            }),
        ),
      unfinalizedFails:
        expectVerificationError(
          'TX_NOT_FINALIZED',
          () =>
            verifyPayoutTransactionEvidence({
              manifest,
              operatorWallet,
              manifestCreatedAt:
                new Date(
                  (blockTimestamp - 10) *
                    1000,
                ),
              evidence: {
                ...evidence,
                finalizedHeadNumber: 499,
              },
            }),
        ),
      wrongClauseFails:
        expectVerificationError(
          'TX_MANIFEST_MISMATCH',
          () =>
            verifyPayoutTransactionEvidence({
              manifest,
              operatorWallet,
              manifestCreatedAt:
                new Date(
                  (blockTimestamp - 10) *
                    1000,
                ),
              evidence: wrongClause,
            }),
        ),
      wrongRewardEventFails:
        expectVerificationError(
          'TX_EVENT_MISMATCH',
          () =>
            verifyPayoutTransactionEvidence({
              manifest,
              operatorWallet,
              manifestCreatedAt:
                new Date(
                  (blockTimestamp - 10) *
                    1000,
                ),
              evidence: wrongEvent,
            }),
        ),
      oldTransactionReplayFails:
        expectVerificationError(
          'TX_PREDATES_MANIFEST',
          () =>
            verifyPayoutTransactionEvidence({
              manifest,
              operatorWallet,
              manifestCreatedAt:
                new Date(
                  (blockTimestamp + 120) *
                    1000,
                ),
              evidence,
            }),
        ),
    };

    const passed =
      Object.values(checks).every(Boolean);

    return NextResponse.json(
      {
        mode: 'PREVIEW_SELF_TEST',
        passed,
        checks,
        verified,
        writesPerformed: false,
        transactionSubmitted: false,
        transfersPerformed: false,
      },
      {
        status: passed ? 200 : 500,
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
            : 'Unknown payout transaction verification self-test error.',
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
