import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  createTransactionIndexResolver,
  type ChainEventPosition,
} from '@/lib/vebetter/eventOrder';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

const PAGE_SIZE = 1000;

const rewardDistributedEvent = new ABIEvent(
  'event RewardDistributed(uint256 amount, bytes32 indexed appId, address indexed receiver, string proof, address indexed distributor)',
);

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

export type QualifyingRewardEvent =
  ChainEventPosition & {
    appId: string;
    amountWei: string;
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

function getEventAmountWei(
  log: RawEventLog,
): string {
  const normalized =
    log.data?.toLowerCase().replace(/^0x/, '') ?? '';

  // RewardDistributed has `amount` as the first non-indexed ABI word.
  // Proof data may follow, but the first 32 bytes are always the uint256
  // reward amount. Malformed chain data fails closed instead of being counted.
  if (
    normalized.length < 64 ||
    !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(
      'VeChain reward event is missing a valid reward amount.',
    );
  }

  return BigInt(
    `0x${normalized.slice(0, 64)}`,
  ).toString();
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

function getEventClauseIndex(
  log: RawEventLog,
): number {
  const clauseIndex =
    log.meta?.clauseIndex;

  if (
    typeof clauseIndex !== 'number' ||
    !Number.isSafeInteger(clauseIndex) ||
    clauseIndex < 0
  ) {
    throw new Error(
      'VeChain reward event is missing a valid clause index.',
    );
  }

  return clauseIndex;
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
  const resolveTxIndex =
    createTransactionIndexResolver(thor);

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

      const amountWei =
        getEventAmountWei(log);

      // A RewardDistributed event with a zero transfer is not a B3TR reward
      // and must never advance the VeInvite three-dApp mission.
      if (BigInt(amountWei) <= 0n) {
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
      const clauseIndex =
        getEventClauseIndex(log);
      const txIndex =
        await resolveTxIndex(
          eventBlock,
          eventTxId,
        );

      uniqueAppIds.add(
        normalizedAppId,
      );

      // Record only the first positive B3TR reward from each of the first three
      // distinct dApps. Later unrelated activity is deliberately not
      // attributed to VeInvite.
      if (qualifyingRewardEvents.length < 3) {
        qualifyingRewardEvents.push({
          appId: normalizedAppId,
          amountWei,
          txId: eventTxId,
          blockNumber: eventBlock,
          blockTimestamp:
            eventTimestamp,
          txIndex,
          clauseIndex,
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
