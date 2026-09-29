import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NODE_URL = 'https://mainnet.vechain.org';
const REWARDS_POOL = '0x6Bee7DDab6c99d5B2Af0554EaEA484CE18F52631';
const PAGE_SIZE = 1000;

const rewardDistributedEvent = new ABIEvent(
  'event RewardDistributed(uint256 amount, bytes32 indexed appId, address indexed receiver, string proof, address indexed distributor)',
);

const TARGETS = [
  {
    inviteCode: 'EALXSC8',
    wallet: '0x0459f87278f58a26beefe3a3928982d52ad12f35',
    activationBlock: 25818965,
    rewardPaidAt: '2026-09-08T03:50:40.000Z',
  },
  {
    inviteCode: 'QNU8TDF',
    wallet: '0x0b542507c5373620d121d6161943a4d6d814d4e5',
    activationBlock: 25818695,
    rewardPaidAt: '2026-09-08T03:50:40.000Z',
  },
  {
    inviteCode: '7ACQA43',
    wallet: '0x79f1fa450b50a0e7ad5c7255ea8a59eb12e12c3e',
    activationBlock: 25842288,
    rewardPaidAt: '2026-09-15T01:22:00.000Z',
  },
  {
    inviteCode: '65242BC',
    wallet: '0x259a1644d0c97a823ca1d6d811f6e6b522d92e82',
    activationBlock: 25880600,
    rewardPaidAt: '2026-09-15T17:23:40.000Z',
  },
  {
    inviteCode: 'JEZP37F',
    wallet: '0x009c2dbbb4b823b0544c3580921b544baf77cb4d',
    activationBlock: 25878913,
    rewardPaidAt: '2026-09-21T00:10:30.000Z',
  },
  {
    inviteCode: 'M89HCCW',
    wallet: '0xf6a8366f038e6a800fa1d61b8c9f0e9857549c31',
    activationBlock: 25930475,
    rewardPaidAt: '2026-09-21T11:10:00.000Z',
  },
] as const;

type RawEventLog = {
  data?: string;
  topics?: string[];
  meta?: {
    blockNumber?: number;
    blockTimestamp?: number;
    txID?: string;
    clauseIndex?: number;
  };
};

function getSingleTopic(
  topic: `0x${string}` | `0x${string}`[] | null | undefined,
): string | undefined {
  return typeof topic === 'string' ? topic : undefined;
}

function parseAmountWei(log: RawEventLog): string | null {
  const normalized =
    log.data?.toLowerCase().replace(/^0x/, '') ?? '';

  if (
    normalized.length < 64 ||
    !/^[0-9a-f]+$/.test(normalized)
  ) {
    return null;
  }

  return BigInt(`0x${normalized.slice(0, 64)}`).toString();
}

async function scanTarget(args: (typeof TARGETS)[number]) {
  const thor = ThorClient.at(NODE_URL);
  const bestBlock = await thor.blocks.getBestBlockCompressed();

  if (!bestBlock) {
    throw new Error('Unable to read best block.');
  }

  const topics = rewardDistributedEvent.encodeFilterTopics([
    null,
    args.wallet,
    null,
  ]);

  const cutoffSeconds =
    Math.floor(new Date(args.rewardPaidAt).getTime() / 1000);

  const events: Array<{
    appId: string;
    amountWei: string;
    amountB3tr: string;
    blockNumber: number;
    blockTimestamp: number;
    timestamp: string;
    txId: string | null;
    clauseIndex: number | null;
  }> = [];

  let offset = 0;

  while (true) {
    const logs = await thor.logs.filterRawEventLogs({
      range: {
        unit: 'block',
        from: args.activationBlock,
        to: bestBlock.number,
      },
      options: {
        offset,
        limit: PAGE_SIZE,
      },
      criteriaSet: [
        {
          address: REWARDS_POOL,
          topic0: getSingleTopic(topics[0]),
          topic1: getSingleTopic(topics[1]),
          topic2: getSingleTopic(topics[2]),
          topic3: getSingleTopic(topics[3]),
        },
      ],
      order: 'asc',
    });

    const raw = logs as RawEventLog[];

    for (const log of raw) {
      const ts = log.meta?.blockTimestamp;
      const block = log.meta?.blockNumber;
      const appId = log.topics?.[1]?.toLowerCase();
      const amountWei = parseAmountWei(log);

      if (
        typeof ts !== 'number' ||
        typeof block !== 'number' ||
        !appId ||
        !amountWei ||
        BigInt(amountWei) <= 0n ||
        ts <= cutoffSeconds
      ) {
        continue;
      }

      events.push({
        appId,
        amountWei,
        amountB3tr:
          (Number(amountWei) / 1e18).toString(),
        blockNumber: block,
        blockTimestamp: ts,
        timestamp: new Date(ts * 1000).toISOString(),
        txId: log.meta?.txID?.toLowerCase() ?? null,
        clauseIndex:
          typeof log.meta?.clauseIndex === 'number'
            ? log.meta.clauseIndex
            : null,
      });
    }

    if (raw.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return {
    inviteCode: args.inviteCode,
    wallet: args.wallet,
    rewardPaidAt: args.rewardPaidAt,
    latestBlock: bestBlock.number,
    postPayoutRewardEventCount: events.length,
    distinctPostPayoutDappCount:
      new Set(events.map((event) => event.appId)).size,
    postPayoutTotalB3tr: events
      .reduce(
        (sum, event) => sum + Number(event.amountWei) / 1e18,
        0,
      )
      .toString(),
    events,
  };
}

export async function GET() {
  const results = [];

  for (const target of TARGETS) {
    results.push(await scanTarget(target));
  }

  return NextResponse.json({
    network: 'mainnet',
    rewardsPool: REWARDS_POOL,
    checkedAt: new Date().toISOString(),
    results,
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
