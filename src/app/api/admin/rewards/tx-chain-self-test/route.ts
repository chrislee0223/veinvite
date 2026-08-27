import { NextResponse } from 'next/server';
import { ThorClient } from '@vechain/sdk-network';

import {
  loadFinalizedRewardTransactionEvidence,
} from '@/lib/rewards/transactionVerification';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

function readTransactions(
  block: unknown,
): string[] {
  if (
    typeof block !== 'object' ||
    block === null ||
    !('transactions' in block) ||
    !Array.isArray(block.transactions)
  ) {
    return [];
  }

  return block.transactions
    .map((value) => String(value).toLowerCase())
    .filter((value) =>
      /^0x[0-9a-f]{64}$/.test(value),
    );
}

function readBlockNumber(
  block: unknown,
): number {
  if (
    typeof block !== 'object' ||
    block === null ||
    !('number' in block)
  ) {
    throw new Error(
      'Finalized block number is unavailable.',
    );
  }

  const number = Number(block.number);

  if (
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    throw new Error(
      'Finalized block number is invalid.',
    );
  }

  return number;
}

export async function GET() {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json(
      {
        error:
          'Finalized transaction chain self-test is disabled in Production.',
      },
      { status: 403 },
    );
  }

  try {
    const { nodeUrl } =
      getVeBetterNetworkConfig();
    const thor = ThorClient.at(nodeUrl);
    const finalized =
      await thor.blocks.getBlockCompressed(
        'finalized',
      );

    if (!finalized) {
      throw new Error(
        'Finalized VeChain block could not be loaded.',
      );
    }

    const finalizedNumber =
      readBlockNumber(finalized);
    let sampleTxId: string | null = null;
    let sampleBlockNumber =
      finalizedNumber;

    for (
      let offset = 0;
      offset <= 30;
      offset += 1
    ) {
      const blockNumber =
        finalizedNumber - offset;

      if (blockNumber < 0) {
        break;
      }

      const block =
        offset === 0
          ? finalized
          : await thor.blocks
              .getBlockCompressed(
                blockNumber,
              );
      const transactions =
        readTransactions(block);

      if (transactions[0]) {
        sampleTxId = transactions[0];
        sampleBlockNumber = blockNumber;
        break;
      }
    }

    if (!sampleTxId) {
      throw new Error(
        'No transaction was found in the last 31 finalized blocks.',
      );
    }

    const evidence =
      await loadFinalizedRewardTransactionEvidence(
        sampleTxId,
      );

    return NextResponse.json(
      {
        mode: 'PREVIEW_CHAIN_SELF_TEST',
        passed:
          evidence.txId === sampleTxId &&
          evidence.blockNumber ===
            sampleBlockNumber &&
          evidence.finalizedHeadNumber >=
            evidence.blockNumber,
        sampleTxId,
        sampleBlockNumber,
        finalizedHeadNumber:
          evidence.finalizedHeadNumber,
        txOrigin: evidence.txOrigin,
        clauseCount: evidence.clauses.length,
        outputCount: evidence.outputs.length,
        reverted: evidence.reverted,
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
        mode: 'PREVIEW_CHAIN_SELF_TEST',
        passed: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown chain self-test error.',
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
