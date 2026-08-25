import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';
import {
  getVeBetterVot3ConversionProgress,
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
    latestBlock,
  };
}

async function sameBlockVoteIsAfterConversion(args: {
  thor: ThorClient;
  voterAddress: string;
  blockNumber: number;
  vote: RawVoteLog;
}): Promise<boolean> {
  // `fromBlock` is the already-verified >=1 B3TR conversion checkpoint used
  // by VeInvite. Re-read that exact block so a vote earlier in the same block
  // cannot accidentally satisfy the "convert, then vote" ordering rule.
  const conversion =
    await getVeBetterVot3ConversionProgress({
      walletAddress:
        args.voterAddress,
      activationBlock:
        args.blockNumber,
      firstQualifyingRewardBlock:
        args.blockNumber,
      checkedBlock:
        args.blockNumber,
    });

  const proof =
    conversion.qualifyingConversion;

  if (!proof) {
    return false;
  }

  const voteTxId =
    getRequiredTxId(args.vote);
  const voteClauseIndex =
    getRequiredClauseIndex(args.vote);

  if (voteTxId === proof.txId) {
    return voteClauseIndex >
      proof.clauseIndex;
  }

  const block =
    await args.thor.blocks
      .getBlockCompressed(
        args.blockNumber,
      );

  if (!block) {
    throw new Error(
      'Unable to load the conversion block to verify vote ordering.',
    );
  }

  const transactions =
    block.transactions.map(
      (txId) =>
        txId.toLowerCase(),
    );
  const conversionTxIndex =
    transactions.indexOf(
      proof.txId.toLowerCase(),
    );
  const voteTxIndex =
    transactions.indexOf(
      voteTxId,
    );

  if (
    conversionTxIndex < 0 ||
    voteTxIndex < 0
  ) {
    throw new Error(
      'Unable to locate conversion and vote transactions in their shared block.',
    );
  }

  return voteTxIndex >
    conversionTxIndex;
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

      const isAfterConversion =
        voteBlock > fromBlock ||
        (
          voteBlock === fromBlock &&
          await sameBlockVoteIsAfterConversion({
            thor,
            voterAddress,
            blockNumber:
              fromBlock,
            vote,
          })
        );

      if (!isAfterConversion) {
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
        voteTxId:
          getRequiredTxId(vote),
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
