import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';
import { NextResponse } from 'next/server';

const STAGING_NODE_URL = 'https://testnet.vechain.org';
const STAGING_REWARDS_POOL =
  '0x2d2a2207c68a46fc79325d7718e639d1047b0d8b';
const DEFAULT_LOOKBACK_BLOCKS = 100_000;
const MAX_LOOKBACK_BLOCKS = 1_000_000;
const PAGE_SIZE = 1_000;
const MAX_PAGES = 20;

const rewardDistributedEvent = new ABIEvent(
  'event RewardDistributed(uint256 amount, bytes32 indexed appId, address indexed receiver, string proof, address indexed distributor)',
);

type RawEventLog = {
  topics?: string[];
  meta?: {
    blockNumber?: number;
    blockTimestamp?: number;
    txID?: string;
  };
};

type AppSummary = {
  appId: string;
  eventCount: number;
  lastBlock: number;
  lastTimestamp: number | null;
  sampleReceiver: string | null;
};

function topicValue(
  topic:
    | `0x${string}`
    | `0x${string}`[]
    | null
    | undefined,
): string | undefined {
  return typeof topic === 'string'
    ? topic
    : undefined;
}

function receiverFromTopic(
  topic: string | undefined,
): string | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) {
    return null;
  }

  return `0x${topic.slice(-40)}`.toLowerCase();
}

function readLookbackBlocks(request: Request): number {
  const requested = Number(
    new URL(request.url).searchParams.get('blocks'),
  );

  if (!Number.isSafeInteger(requested) || requested <= 0) {
    return DEFAULT_LOOKBACK_BLOCKS;
  }

  return Math.min(requested, MAX_LOOKBACK_BLOCKS);
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const lookbackBlocks = readLookbackBlocks(request);
    const thor = ThorClient.at(STAGING_NODE_URL);
    const bestBlock =
      await thor.blocks.getBestBlockCompressed();

    if (!bestBlock) {
      throw new Error('Unable to read staging best block.');
    }

    const fromBlock = Math.max(
      0,
      bestBlock.number - lookbackBlocks,
    );
    const topics =
      rewardDistributedEvent.encodeFilterTopics([
        null,
        null,
        null,
      ]);

    const summaries = new Map<string, AppSummary>();
    let totalEvents = 0;
    let pagesRead = 0;
    let lastPageWasFull = false;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const logs =
        (await thor.logs.filterRawEventLogs({
          range: {
            unit: 'block',
            from: fromBlock,
            to: bestBlock.number,
          },
          options: {
            offset: page * PAGE_SIZE,
            limit: PAGE_SIZE,
          },
          criteriaSet: [
            {
              address: STAGING_REWARDS_POOL,
              topic0: topicValue(topics[0]),
            },
          ],
          order: 'desc',
        })) as RawEventLog[];

      pagesRead += 1;
      totalEvents += logs.length;
      lastPageWasFull = logs.length === PAGE_SIZE;

      for (const log of logs) {
        const appId = log.topics?.[1]?.toLowerCase();
        const blockNumber = log.meta?.blockNumber;

        if (
          !appId ||
          !/^0x[0-9a-f]{64}$/.test(appId) ||
          typeof blockNumber !== 'number'
        ) {
          continue;
        }

        const existing = summaries.get(appId);
        if (existing) {
          existing.eventCount += 1;
          continue;
        }

        summaries.set(appId, {
          appId,
          eventCount: 1,
          lastBlock: blockNumber,
          lastTimestamp:
            typeof log.meta?.blockTimestamp === 'number'
              ? log.meta.blockTimestamp
              : null,
          sampleReceiver:
            receiverFromTopic(log.topics?.[2]),
        });
      }

      if (!lastPageWasFull) {
        break;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        network: 'testnet-staging',
        rewardsPool: STAGING_REWARDS_POOL,
        bestBlock: bestBlock.number,
        fromBlock,
        lookbackBlocks,
        pagesRead,
        totalEvents,
        truncated:
          pagesRead === MAX_PAGES && lastPageWasFull,
        apps: Array.from(summaries.values()).sort(
          (a, b) => b.lastBlock - a.lastBlock,
        ),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error('Staging reward scan failed:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Staging reward activity could not be scanned.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
