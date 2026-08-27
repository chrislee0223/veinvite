import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  createTransactionIndexResolver,
  isStrictlyAfter,
} from '@/lib/vebetter/eventOrder';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';
import type {
  Vot3ConversionEvent,
} from '@/lib/vebetter/vot3Conversion';

const PAGE_SIZE = 1000;

const allocationVoteCastEvent =
  new ABIEvent(
    'event AllocationVoteCast(address indexed voter, uint256 indexed roundId, bytes32[] appsIds, uint256[] voteWeights)',
  );

type RawVoteLog = {
  topics?: string[];
  meta?: {
    blockNumber?: number;
    blockTimestamp?: number;
    txID?: string;
    clauseIndex?: number;
  };
};

export type VoteProgress = {
  voteCompleted: boolean;
  voteCompletedBlock: number | null;
  voteRoundId: number | null;
  voteTxId: string | null;
  voteBlockTimestamp: number | null;
  voteTxIndex: number | null;
  voteClauseIndex: number | null;
  latestBlock: number;
};

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

function isValidAddress(
  address: string,
): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(
    address,
  );
}

function getRequiredRoundId(
  topic: string | undefined,
): number {
  if (!topic) {
    throw new Error(
      'Vote event is missing its round ID.',
    );
  }

  try {
    const value = Number(
      BigInt(topic),
    );

    if (
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new Error(
        'Vote round ID is outside the supported range.',
      );
    }

    return value;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      'Vote event contains an invalid round ID.',
    );
  }
}

function getRequiredBlockNumber(
  log: RawVoteLog,
): number {
  const blockNumber =
    log.meta?.blockNumber;

  if (
    typeof blockNumber !== 'number' ||
    !Number.isSafeInteger(
      blockNumber,
    ) ||
    blockNumber < 0
  ) {
    throw new Error(
      'Vote event is missing a valid block number.',
    );
  }

  return blockNumber;
}

function getRequiredBlockTimestamp(
  log: RawVoteLog,
): number {
  const timestamp =
    log.meta?.blockTimestamp;

  if (
    typeof timestamp !== 'number' ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0
  ) {
    throw new Error(
      'Vote event is missing a valid block timestamp.',
    );
  }

  return timestamp;
}

function getRequiredClauseIndex(
  log: RawVoteLog,
): number {
  const clauseIndex =
    log.meta?.clauseIndex;

  if (
    typeof clauseIndex !== 'number' ||
    !Number.isSafeInteger(
      clauseIndex,
    ) ||
    clauseIndex < 0
  ) {
    throw new Error(
      'Vote event is missing a valid clause index.',
    );
  }

  return clauseIndex;
}

function getRequiredTxId(
  log: RawVoteLog,
): string {
  const txId =
    log.meta?.txID?.toLowerCase();

  if (
    !txId ||
    !/^0x[0-9a-f]{64}$/.test(txId)
  ) {
    throw new Error(
      'Vote event is missing a valid transaction ID.',
    );
  }

  return txId;
}

function emptyProgress(
  latestBlock: number,
): VoteProgress {
  return {
    voteCompleted: false,
    voteCompletedBlock: null,
    voteRoundId: null,
    voteTxId: null,
    voteBlockTimestamp: null,
    voteTxIndex: null,
    voteClauseIndex: null,
    latestBlock,
  };
}

export async function getVeBetterVoteProgress({
  voterAddress,
  conversion,
}: {
  voterAddress: string;
  conversion: Vot3ConversionEvent;
}): Promise<VoteProgress> {
  if (
    !isValidAddress(voterAddress)
  ) {
    throw new Error(
      'Invalid voter address.',
    );
  }

  if (
    !Number.isSafeInteger(conversion.blockNumber) ||
    conversion.blockNumber < 0 ||
    !Number.isSafeInteger(conversion.txIndex) ||
    conversion.txIndex < 0 ||
    !Number.isSafeInteger(conversion.clauseIndex) ||
    conversion.clauseIndex < 0 ||
    !/^0x[0-9a-f]{64}$/.test(conversion.txId)
  ) {
    throw new Error(
      'Invalid VOT3 conversion checkpoint for vote verification.',
    );
  }

  const {
    nodeUrl,
    xAllocationVotingAddress,
  } = getVeBetterNetworkConfig();

  const thor = ThorClient.at(nodeUrl);
  const resolveTxIndex =
    createTransactionIndexResolver(thor);

  const bestBlock =
    await thor.blocks
      .getBestBlockCompressed();

  if (!bestBlock) {
    throw new Error(
      'Unable to load the latest VeChain block.',
    );
  }

  const latestBlock =
    bestBlock.number;

  if (conversion.blockNumber > latestBlock) {
    return emptyProgress(
      latestBlock,
    );
  }

  const topics =
    allocationVoteCastEvent
      .encodeFilterTopics([
        voterAddress,
        null,
      ]);

  let offset = 0;

  while (true) {
    const logs =
      await thor.logs
        .filterRawEventLogs({
          range: {
            unit: 'block',
            from: conversion.blockNumber,
            to: latestBlock,
          },
          options: {
            offset,
            limit: PAGE_SIZE,
          },
          criteriaSet: [
            {
              address:
                xAllocationVotingAddress,
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
            },
          ],
          order: 'asc',
        });

    const rawLogs =
      logs as RawVoteLog[];

    for (const vote of rawLogs) {
      const voteBlock =
        getRequiredBlockNumber(vote);
      const voteTxId =
        getRequiredTxId(vote);
      const voteClauseIndex =
        getRequiredClauseIndex(vote);
      const voteTxIndex =
        await resolveTxIndex(
          voteBlock,
          voteTxId,
        );

      if (
        !isStrictlyAfter(
          {
            blockNumber: voteBlock,
            txId: voteTxId,
            txIndex: voteTxIndex,
            clauseIndex: voteClauseIndex,
          },
          conversion,
        )
      ) {
        continue;
      }

      return {
        voteCompleted: true,
        voteCompletedBlock:
          voteBlock,
        voteRoundId:
          getRequiredRoundId(
            vote.topics?.[2],
          ),
        voteTxId,
        voteBlockTimestamp:
          getRequiredBlockTimestamp(
            vote,
          ),
        voteTxIndex,
        voteClauseIndex,
        latestBlock,
      };
    }

    if (
      rawLogs.length < PAGE_SIZE
    ) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return emptyProgress(
    latestBlock,
  );
}
