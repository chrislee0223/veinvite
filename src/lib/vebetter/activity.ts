import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

const PAGE_SIZE = 1000;

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

export type QualifyingRewardEvent = {
  appId: string;
  txId: string;
  blockNumber: number;
  blockTimestamp: number;
};

export type ActivityProgress = {
  appsCompleted: number;
  uniqueAppIds: string[];
  latestBlock: number;
  thirdAppCompletedBlock: number | null;
  thirdAppCompletedTimestamp: number | null;
  qualifyingRewardEvents: QualifyingRewardEvent[];
};

function getSingleTopic(
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

function getEventBlockTimestamp(
  log: RawEventLog,
): number {
  const timestamp =
    log.meta?.blockTimestamp;

  if (
    typeof timestamp !== 'number' ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0
  ) {
    throw new Error(
      'VeChain reward event is missing a valid block timestamp.',
    );
  }

  return timestamp;
}

function getEventTxId(
  log: RawEventLog,
): string {
  const txId =
    log.meta?.txID?.toLowerCase();

  if (
    !txId ||
    !/^0x[0-9a-f]{64}$/.test(txId)
  ) {
    throw new Error(
      'VeChain reward event is missing a valid transaction ID.',
    );
  }

  return txId;
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

  const {
    nodeUrl,
    x2EarnRewardsPoolAddress,
  } = getVeBetterNetworkConfig();

  const thor = ThorClient.at(nodeUrl);

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
      thirdAppCompletedTimestamp: null,
      qualifyingRewardEvents: [],
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

  const qualifyingRewardEvents:
    QualifyingRewardEvent[] = [];

  let thirdAppCompletedBlock:
    number | null = null;
  let thirdAppCompletedTimestamp:
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
              x2EarnRewardsPoolAddress,
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
      const eventTimestamp =
        getEventBlockTimestamp(log);
      const eventTxId =
        getEventTxId(log);

      uniqueAppIds.add(
        normalizedAppId,
      );

      // Record only the first reward from each of the first three distinct
      // dApps. These are the minimum verified activities VeInvite requires;
      // later unrelated activity is deliberately not attributed to VeInvite.
      if (qualifyingRewardEvents.length < 3) {
        qualifyingRewardEvents.push({
          appId: normalizedAppId,
          txId: eventTxId,
          blockNumber: eventBlock,
          blockTimestamp:
            eventTimestamp,
        });
      }

      if (
        uniqueAppIds.size === 3 &&
        thirdAppCompletedBlock === null
      ) {
        thirdAppCompletedBlock =
          eventBlock;
        thirdAppCompletedTimestamp =
          eventTimestamp;
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
    thirdAppCompletedTimestamp,
    qualifyingRewardEvents,
  };
}
