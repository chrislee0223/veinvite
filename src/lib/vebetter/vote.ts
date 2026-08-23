import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

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

export async function getVeBetterVoteProgress({
  voterAddress,
  fromBlock,
}: {
  voterAddress: string;
  fromBlock: number;
}): Promise<VoteProgress> {
  if (
    !isValidAddress(voterAddress)
  ) {
    throw new Error(
      'Invalid voter address.',
    );
  }

  if (
    !Number.isSafeInteger(fromBlock) ||
    fromBlock < 0
  ) {
    throw new Error(
      'Invalid vote checkpoint block.',
    );
  }

  const {
    nodeUrl,
    xAllocationVotingAddress,
  } = getVeBetterNetworkConfig();

  const thor = ThorClient.at(nodeUrl);

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
    return {
      voteCompleted: false,
      voteCompletedBlock: null,
      voteRoundId: null,
      voteTxId: null,
      voteBlockTimestamp: null,
      latestBlock,
    };
  }

  const topics =
    allocationVoteCastEvent
      .encodeFilterTopics([
        voterAddress,
        null,
      ]);

  const logs =
    await thor.logs
      .filterRawEventLogs({
        range: {
          unit: 'block',
          from: fromBlock,
          to: latestBlock,
        },
        options: {
          offset: 0,
          limit: 1,
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

  const firstVote =
    (logs as RawVoteLog[])[0];

  if (!firstVote) {
    return {
      voteCompleted: false,
      voteCompletedBlock: null,
      voteRoundId: null,
      voteTxId: null,
      voteBlockTimestamp: null,
      latestBlock,
    };
  }

  const voteRoundId =
    getRequiredRoundId(
      firstVote.topics?.[2],
    );

  const voteCompletedBlock =
    getRequiredBlockNumber(
      firstVote,
    );

  return {
    voteCompleted: true,
    voteCompletedBlock,
    voteRoundId,
    voteTxId:
      getRequiredTxId(firstVote),
    voteBlockTimestamp:
      getRequiredBlockTimestamp(firstVote),
    latestBlock,
  };
}
