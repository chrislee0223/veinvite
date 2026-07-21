import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

const DEFAULT_VECHAIN_NODE_URL =
  'https://mainnet.vechain.org';

const X2EARN_REWARDS_POOL =
  '0x6Bee7DDab6c99d5B2Af0554EaEA484CE18F52631';

const PAGE_SIZE = 1000;

const rewardDistributedEvent = new ABIEvent(
  'event RewardDistributed(uint256 amount, bytes32 indexed appId, address indexed receiver, string proof, address indexed distributor)',
);

type RawEventLog = {
  topics?: string[];
};

export type ActivityProgress = {
  appsCompleted: number;
  uniqueAppIds: string[];
  latestBlock: number;
};

function getThorClient() {
  const nodeUrl =
    process.env.VECHAIN_NODE_URL ??
    DEFAULT_VECHAIN_NODE_URL;

  return ThorClient.at(nodeUrl);
}

function getSingleTopic(
  topic:
    | `0x${string}`
    | `0x${string}`[]
    | undefined,
): string | undefined {
  if (typeof topic === 'string') {
    return topic;
  }

  return undefined;
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

  const latestBlock = bestBlock.number;

  if (activationBlock > latestBlock) {
    return {
      appsCompleted: 0,
      uniqueAppIds: [],
      latestBlock,
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
            address: X2EARN_REWARDS_POOL,
            topic0:
              getSingleTopic(topics[0]),
            topic1:
              getSingleTopic(topics[1]),
            topic2:
              getSingleTopic(topics[2]),
            topic3:
              getSingleTopic(topics[3]),
          },
        ],
        order: 'asc',
      });

    const rawLogs =
      logs as RawEventLog[];

    for (const log of rawLogs) {
      /*
       * RewardDistributed topics:
       *
       * topic0 = event signature
       * topic1 = appId
       * topic2 = receiver
       * topic3 = distributor
       */
      const appId =
        log.topics?.[1];

      if (appId) {
        uniqueAppIds.add(
          appId.toLowerCase(),
        );
      }
    }

    if (rawLogs.length < PAGE_SIZE) {
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
  };
}
