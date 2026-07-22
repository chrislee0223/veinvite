import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

const DEFAULT_VECHAIN_NODE_URL =
  'https://mainnet.vechain.org';

const DEFAULT_X2EARN_REWARDS_POOL =
  '0x6Bee7DDab6c99d5B2Af0554EaEA484CE18F52631';

const PAGE_SIZE = 1000;

const rewardDistributedEvent = new ABIEvent(
  'event RewardDistributed(uint256 amount, bytes32 indexed appId, address indexed receiver, string proof, address indexed distributor)',
);

type RawEventLog = {
  topics?: string[];
  meta?: {
    blockNumber?: number;
  };
};

export type ActivityProgress = {
  appsCompleted: number;
  uniqueAppIds: string[];
  latestBlock: number;
  thirdAppCompletedBlock: number | null;
};

function getThorClient() {
  const nodeUrl =
    process.env.VECHAIN_NODE_URL ??
    DEFAULT_VECHAIN_NODE_URL;

  return ThorClient.at(nodeUrl);
}

function getRewardsPoolAddress() {
  return (
    process.env.X2EARN_REWARDS_POOL_ADDRESS ??
    DEFAULT_X2EARN_REWARDS_POOL
  );
}

function getSingleTopic(
  topic:
    | `0x${string}`
    | `0x${string}`[]
    | null
    | undefined,
): string | undefined {
  if (typeof topic === 'string') {
    return topic;
  }

  return undefined;
}

function getEventBlockNumber(
  log: RawEventLog,
): number {
  const blockNumber =
    log.meta?.blockNumber;

  if (
    typeof blockNumber !== 'number' ||
    !Number.isSafeInteger(blockNumber) ||
    blockNumber < 0
  ) {
    throw new Error(
      'VeChain reward event is missing a valid block number.',
    );
  }

  return blockNumber;
}

export async function getVeBetterActivityProgress({
  receiverAddress,
  activationBlock,
}: {
  receiverAddress: string;
  activationBlock: number;
}): Promise<ActivityProgress> {
  if (
    !Number.isSafeInteger(activationBlock) ||
    activationBlock < 0
  ) {
    throw new Error(
      'Invalid activation block.',
    );
  }

  const thor = getThorClient();

  const bestBlock =
    await thor.blocks.getBestBlockCompressed();

  if (!bestBlock) {
    throw new Error(
      'Unable to load the latest VeChain block.',
    );
  }

  const latestBlock =
    bestBlock.number;

  if (activationBlock > latestBlock) {
    return {
      appsCompleted: 0,
      uniqueAppIds: [],
      latestBlock,
      thirdAppCompletedBlock: null,
    };
  }

  const topics =
    rewardDistributedEvent.encodeFilterTopics([
      null,
      receiverAddress,
      null,
    ]);

  const uniqueAppIds =
    new Set<string>();

  let thirdAppCompletedBlock:
    number | null = null;

  let offset = 0;

  while (true) {
    const logs =
      await thor.logs.filterRawEventLogs({
        range: {
          unit: 'block',
          from: activationBlock,
          to: latestBlock,
        },
        options: {
          offset,
          limit: PAGE_SIZE,
        },
        criteriaSet: [
          {
            address:
              getRewardsPoolAddress(),
            topic0:
              getSingleTopic(
                topics[0],
              ),
            topic1:
              getSingleTopic(
                topics[1],
              ),
            topic2:
              getSingleTopic(
                topics[2],
              ),
            topic3:
              getSingleTopic(
                topics[3],
              ),
          },
        ],
        order: 'asc',
      });

    const rawLogs =
      logs as RawEventLog[];

    for (const log of rawLogs) {
      const appId =
        log.topics?.[1];

      if (!appId) {
        continue;
      }

      const normalizedAppId =
        appId.toLowerCase();

      if (
        uniqueAppIds.has(
          normalizedAppId,
        )
      ) {
        continue;
      }

      const eventBlock =
        getEventBlockNumber(log);

      uniqueAppIds.add(
        normalizedAppId,
      );

      if (
        uniqueAppIds.size === 3 &&
        thirdAppCompletedBlock === null
      ) {
        thirdAppCompletedBlock =
          eventBlock;
      }
    }

    if (
      rawLogs.length < PAGE_SIZE
    ) {
      break;
    }

    offset += PAGE_SIZE;
  }

  const appIds =
    Array.from(uniqueAppIds);

  return {
    appsCompleted: Math.min(
      appIds.length,
      3,
    ),
    uniqueAppIds: appIds,
    latestBlock,
    thirdAppCompletedBlock,
  };
}
