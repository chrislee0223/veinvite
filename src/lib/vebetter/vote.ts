import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

const DEFAULT_VECHAIN_NODE_URL =
  'https://mainnet.vechain.org';

const X_ALLOCATION_VOTING =
  '0x89A00Bb0947a30FF95BEeF77a66AEdE3842Fe5B7';

const allocationVoteCastEvent =
  new ABIEvent(
    'event AllocationVoteCast(address indexed voter, uint256 indexed roundId, bytes32[] appsIds, uint256[] voteWeights)',
  );

type RawVoteLog = {
  topics?: string[];
  meta?: {
    blockNumber?: number;
  };
};

export type VoteProgress = {
  voteCompleted: boolean;
  voteCompletedBlock: number | null;
  voteRoundId: number | null;
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
    | null
    | undefined,
): string | undefined {
  if (typeof topic === 'string') {
    return topic;
  }

  return undefined;
}

function parseRoundId(
  topic: string | undefined,
): number | null {
  if (!topic) {
    return null;
  }

  try {
    const value = Number(
      BigInt(topic),
    );

    if (
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

export async function getVeBetterVoteProgress({
  voterAddress,
  fromBlock,
}: {
  voterAddress: string;
  fromBlock: number;
}): Promise<VoteProgress> {
  if (
    !Number.isSafeInteger(fromBlock) ||
    fromBlock < 0
  ) {
    throw new Error(
      'Invalid vote checkpoint block.',
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

  if (fromBlock > latestBlock) {
    return {
      voteCompleted: false,
      voteCompletedBlock: null,
      voteRoundId: null,
      latestBlock,
    };
  }

  const topics =
    allocationVoteCastEvent.encodeFilterTopics(
      [
        voterAddress,
        null,
      ],
    );

  const logs =
    await thor.logs.filterRawEventLogs({
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
            X_ALLOCATION_VOTING,
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
      latestBlock,
    };
  }

  const voteRoundId =
    parseRoundId(
      firstVote.topics?.[2],
    );

  const voteCompletedBlock =
    firstVote.meta?.blockNumber ??
    null;

  return {
    voteCompleted: true,
    voteCompletedBlock,
    voteRoundId,
    latestBlock,
  };
}
