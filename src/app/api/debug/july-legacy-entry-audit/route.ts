import { NextResponse } from 'next/server';

import { checkHistoricalVeBetterEntryEligibility } from '@/lib/vebetter/historicalEntryEligibility';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

export const dynamic = 'force-dynamic';

type BlockResponse = {
  number?: number;
  timestamp?: number;
};

const CASES = [
  {
    inviteCode: 'NP5U8PX',
    walletAddress: '0x9d3be3deec483340e8da1d6d56171b618a7aaf10',
    createdAt: '2026-07-20T03:32:08.215Z',
  },
  {
    inviteCode: '5HXW4VP',
    walletAddress: '0xeff325935b63299e9eeda79931bed6ec119aefcb',
    createdAt: '2026-07-20T14:46:40.390Z',
  },
] as const;

const ACTIVATION_BLOCK_FEATURE_COMMIT_AT = '2026-07-21T14:07:13.000Z';

async function loadBlock(nodeUrl: string, revision: number | 'best') {
  const response = await fetch(`${nodeUrl}/blocks/${revision}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Block ${revision} returned HTTP ${response.status}`);
  }

  const block = (await response.json()) as BlockResponse;
  if (
    typeof block.number !== 'number' ||
    !Number.isSafeInteger(block.number) ||
    typeof block.timestamp !== 'number' ||
    !Number.isSafeInteger(block.timestamp)
  ) {
    throw new Error(`Block ${revision} returned malformed metadata.`);
  }

  return { number: block.number, timestamp: block.timestamp };
}

async function blockAtOrBefore(nodeUrl: string, isoTimestamp: string) {
  const targetSeconds = Math.floor(new Date(isoTimestamp).getTime() / 1000);
  const best = await loadBlock(nodeUrl, 'best');

  let low = 1;
  let high = best.number;
  let answer = 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const block = await loadBlock(nodeUrl, mid);

    if (block.timestamp <= targetSeconds) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const block = await loadBlock(nodeUrl, answer);
  return {
    ...block,
    isoTimestamp: new Date(block.timestamp * 1000).toISOString(),
  };
}

async function eventWithTime(
  nodeUrl: string,
  event: { txId: string; blockNumber: number } | null,
) {
  if (!event) return null;
  const block = await loadBlock(nodeUrl, event.blockNumber);
  return {
    ...event,
    blockTimestamp: new Date(block.timestamp * 1000).toISOString(),
  };
}

export async function GET() {
  if (process.env.VERCEL_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const { network, nodeUrl } = getVeBetterNetworkConfig();
  const best = await loadBlock(nodeUrl, 'best');
  const featureBlock = await blockAtOrBefore(
    nodeUrl,
    ACTIVATION_BLOCK_FEATURE_COMMIT_AT,
  );

  const results = [];

  for (const item of CASES) {
    const createdBlock = await blockAtOrBefore(nodeUrl, item.createdAt);
    const createdCheck = await checkHistoricalVeBetterEntryEligibility({
      walletAddress: item.walletAddress,
      checkedBlock: createdBlock.number,
    });
    const featureCheck = await checkHistoricalVeBetterEntryEligibility({
      walletAddress: item.walletAddress,
      checkedBlock: featureBlock.number,
    });
    const currentCheck = await checkHistoricalVeBetterEntryEligibility({
      walletAddress: item.walletAddress,
      checkedBlock: best.number,
    });

    results.push({
      ...item,
      network,
      createdBlock,
      featureBlock,
      createdCheck,
      featureCheck,
      currentCheck: {
        ...currentCheck,
        priorRewardEvent: await eventWithTime(nodeUrl, currentCheck.priorRewardEvent),
        priorVoteEvent: await eventWithTime(nodeUrl, currentCheck.priorVoteEvent),
        recentRewardEvent: await eventWithTime(nodeUrl, currentCheck.recentRewardEvent),
        recentVoteEvent: await eventWithTime(nodeUrl, currentCheck.recentVoteEvent),
      },
    });
  }

  return NextResponse.json(
    { results },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
