import { ThorClient } from '@vechain/sdk-network';
import { NextResponse } from 'next/server';

import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

export const dynamic = 'force-dynamic';

const TX_ID = '0xfbe387a0894f0bb4c2279861a587879ae0112fc77069883f92e984de4651591c';

export async function GET() {
  const { nodeUrl } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);

  try {
    const [transaction, receipt, best, finalized] = await Promise.all([
      thor.transactions.getTransaction(TX_ID).catch(() => null),
      thor.transactions.getTransactionReceipt(TX_ID).catch(() => null),
      thor.blocks.getBestBlockCompressed().catch(() => null),
      thor.blocks.getBlockCompressed('finalized').catch(() => null),
    ]);

    return NextResponse.json({
      txId: TX_ID,
      transactionFound: Boolean(transaction),
      receiptFound: Boolean(receipt),
      reverted: receipt?.reverted ?? null,
      receiptBlockNumber: receipt?.meta ? Number(receipt.meta.blockNumber) : null,
      receiptBlockId: receipt?.meta ? String(receipt.meta.blockID).toLowerCase() : null,
      receiptBlockTimestamp: receipt?.meta ? Number(receipt.meta.blockTimestamp) : null,
      bestBlockNumber: best ? Number(best.number) : null,
      finalizedBlockNumber: finalized ? Number(finalized.number) : null,
      finalizedBlockId: finalized ? String(finalized.id).toLowerCase() : null,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Round 13 chain status inspection failed:', error);
    return NextResponse.json({ error: 'Chain status inspection failed.' }, { status: 500 });
  }
}
