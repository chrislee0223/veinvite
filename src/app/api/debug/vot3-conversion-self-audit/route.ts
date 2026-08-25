import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';
import { NextResponse } from 'next/server';

import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';
import {
  getVeBetterVot3ConversionProgress,
} from '@/lib/vebetter/vot3Conversion';

export const dynamic = 'force-dynamic';

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000';
const LOOKBACK_BLOCKS = 200_000;
const transferEvent = new ABIEvent(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

function singleTopic(
  value:
    | `0x${string}`
    | `0x${string}`[]
    | null
    | undefined,
): string | undefined {
  return typeof value === 'string'
    ? value
    : undefined;
}

function walletFromTopic(
  topic: string | undefined,
): string | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) {
    return null;
  }

  return `0x${topic.slice(-40)}`.toLowerCase();
}

export async function GET() {
  if (process.env.VERCEL_ENV === 'production') {
    return new NextResponse(null, {
      status: 404,
    });
  }

  const {
    nodeUrl,
    vot3Address,
  } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const best =
    await thor.blocks.getBestBlockCompressed();

  if (!best) {
    throw new Error('Unable to load best block.');
  }

  const fromBlock = Math.max(
    0,
    best.number - LOOKBACK_BLOCKS,
  );
  const mintTopics =
    transferEvent.encodeFilterTopics([
      ZERO_ADDRESS,
      null,
      null,
    ]);

  const mintLogs =
    await thor.logs.filterRawEventLogs({
      range: {
        unit: 'block',
        from: fromBlock,
        to: best.number,
      },
      options: {
        offset: 0,
        limit: 20,
      },
      criteriaSet: [
        {
          address: vot3Address,
          topic0: singleTopic(mintTopics[0]),
          topic1: singleTopic(mintTopics[1]),
        },
      ],
      order: 'desc',
    });

  for (const log of mintLogs) {
    const wallet = walletFromTopic(
      log.topics?.[2],
    );
    const blockNumber =
      log.meta?.blockNumber;

    if (
      !wallet ||
      typeof blockNumber !== 'number' ||
      !Number.isSafeInteger(blockNumber)
    ) {
      continue;
    }

    const result =
      await getVeBetterVot3ConversionProgress({
        walletAddress: wallet,
        activationBlock: blockNumber,
        firstQualifyingRewardBlock:
          blockNumber,
        checkedBlock: blockNumber,
      });

    if (result.matchedConversionEvents.length > 0) {
      return NextResponse.json({
        mode: 'READ_ONLY_VOT3_CONVERSION_SELF_AUDIT',
        writesPerformed: false,
        transfersPerformed: false,
        recentMintCandidates: mintLogs.length,
        wallet,
        blockNumber,
        result,
      }, {
        headers: {
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
        },
      });
    }
  }

  return NextResponse.json({
    mode: 'READ_ONLY_VOT3_CONVERSION_SELF_AUDIT',
    writesPerformed: false,
    transfersPerformed: false,
    recentMintCandidates: mintLogs.length,
    matchedDirectConversions: 0,
    checkedRange: {
      fromBlock,
      toBlock: best.number,
    },
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
