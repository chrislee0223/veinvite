import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  createTransactionIndexResolver,
  isStrictlyAfter,
  type ChainEventPosition,
} from '@/lib/vebetter/eventOrder';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

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

function validateKnownPosition(
  position: ChainEventPosition,
): ChainEventPosition {
  const txId = position.txId.toLowerCase();

  if (!/^0x[0-9a-f]{64}$/.test(txId)) {
    throw new Error(
      'Qualifying VOT3 conversion has an invalid transaction ID.',
    );
  }

  for (const [label, value] of [
    ['block number', position.blockNumber],
    ['transaction index', position.txIndex],
    ['clause index', position.clauseIndex],
  ] as const) {
    if (
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new Error(
        `Qualifying VOT3 conversion has an invalid ${label}.`,
      );
    }
  }

  return {
    txId,
    blockNumber: position.blockNumber,
    txIndex: position.txIndex,
    clauseIndex: position.clauseIndex,
  };
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
    latestBlock,
  };
}

/**
 * Finds the first AllocationVoteCast strictly after the exact qualifying
 * B3TR -> VOT3 conversion in VeChain execution order. The exact conversion
 * position is supplied by the conversion verifier, so same-block ordering does
 * not need to rediscover or guess which conversion was used by VeInvite.
 */
export async function getVeBetterVoteProgress({
  voterAddress,
  conversionPosition: rawConversionPosition,
}: {
  voterAddress: string;
  conversionPosition: ChainEventPosition;
}): Promise<VoteProgress> {
  if (
    !isValidAddress(voterAddress)
  ) {
    throw new Error(
      'Invalid voter address.',
    );
  }

  const conversionPosition =
    validateKnownPosition(
      rawConversionPosition,
    );
  const fromBlock =
    conversionPosition.blockNumber;

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

  if (fromBlock > latestBlock) {
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
            from: fromBlock,
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
        getRequiredBlockNumber(
          vote,
        );
      const voteTxId =
        getRequiredTxId(vote);
      const voteClauseIndex =
        getRequiredClauseIndex(vote);
      const votePosition:
        ChainEventPosition = {
          txId: voteTxId,
          blockNumber: voteBlock,
          txIndex: await resolveTxIndex(
            voteBlock,
            voteTxId,
          ),
          clauseIndex: voteClauseIndex,
        };

      if (
        !isStrictlyAfter(
          votePosition,
          conversionPosition,
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
