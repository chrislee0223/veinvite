import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

export const RETURNING_USER_DORMANCY_ROUNDS = 12;
export const ENTRY_ELIGIBILITY_RULE_VERSION =
  'entry-history-v2-12-completed-rounds';

const rewardDistributedEvent = new ABIEvent(
  'event RewardDistributed(uint256 amount, bytes32 indexed appId, address indexed receiver, string proof, address indexed distributor)',
);

const allocationVoteCastEvent = new ABIEvent(
  'event AllocationVoteCast(address indexed voter, uint256 indexed roundId, bytes32[] appsIds, uint256[] voteWeights)',
);

const xAllocationVotingRoundAbi = [
  {
    inputs: [],
    name: 'currentRoundId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'roundId', type: 'uint256' }],
    name: 'getRound',
    outputs: [
      {
        components: [
          { name: 'proposer', type: 'address' },
          { name: 'voteStart', type: 'uint48' },
          { name: 'voteDuration', type: 'uint32' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

type RawLog = {
  meta?: {
    blockNumber?: number;
    txID?: string;
  };
};

export type EntryChainEvent = {
  txId: string;
  blockNumber: number;
};

export type EntryClass =
  | 'new_user'
  | 'returning_user'
  | 'active_existing_user';

export type DormancyRoundWindow = {
  currentRoundId: number;
  oldestCompletedRoundId: number;
  newestCompletedRoundId: number;
  completedRoundIds: number[];
  dormancyStartBlock: number;
  newestCompletedRoundEndBlock: number;
};

export type EntryEligibilityResult = {
  outcome: 'eligible' | 'existing_vebetter_user';
  entryClass: EntryClass;
  network: VeBetterNetwork;
  checkedBlock: number;
  priorRewardEvent: EntryChainEvent | null;
  priorVoteEvent: EntryChainEvent | null;
  recentRewardEvent: EntryChainEvent | null;
  recentVoteEvent: EntryChainEvent | null;
  dormancyWindow: DormancyRoundWindow;
};

type RoundRecord = {
  roundId: number;
  voteStart: number;
  voteEnd: number;
};

function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

function getSingleTopic(
  topic:
    | `0x${string}`
    | `0x${string}`[]
    | null
    | undefined,
): string | undefined {
  return typeof topic === 'string' ? topic : undefined;
}

function toSafeInteger(
  value: bigint | number,
  label: string,
): number {
  const numberValue =
    typeof value === 'bigint' ? Number(value) : value;

  if (
    !Number.isSafeInteger(numberValue) ||
    numberValue < 0
  ) {
    throw new Error(
      `${label} is not a safe non-negative integer.`,
    );
  }

  return numberValue;
}

function parseChainEvent(
  log: RawLog | undefined,
  label: string,
): EntryChainEvent | null {
  if (!log) {
    return null;
  }

  const txId = log.meta?.txID?.toLowerCase();
  const blockNumber = log.meta?.blockNumber;

  if (
    !txId ||
    !/^0x[0-9a-f]{64}$/.test(txId) ||
    typeof blockNumber !== 'number' ||
    !Number.isSafeInteger(blockNumber) ||
    blockNumber < 0
  ) {
    throw new Error(
      `${label} history returned malformed chain metadata.`,
    );
  }

  return { txId, blockNumber };
}

async function getDormancyRoundWindow({
  thor,
  xAllocationVotingAddress,
  checkedBlock,
}: {
  thor: ReturnType<typeof ThorClient.at>;
  xAllocationVotingAddress: string;
  checkedBlock: number;
}): Promise<DormancyRoundWindow> {
  const contract = thor.contracts.load(
    xAllocationVotingAddress,
    xAllocationVotingRoundAbi,
  );

  const currentRoundResult =
    await contract.read.currentRoundId();
  const currentRoundId = toSafeInteger(
    currentRoundResult[0],
    'Current VeBetter round id',
  );

  if (
    currentRoundId < RETURNING_USER_DORMANCY_ROUNDS
  ) {
    throw new Error(
      'VeBetter does not have enough completed rounds for the returning-user dormancy rule.',
    );
  }

  // currentRoundId plus the previous 12 ids is enough to find the nearest
  // 12 completed rounds. Completion is verified against the sealed best block.
  const lowestRoundId = Math.max(
    1,
    currentRoundId - RETURNING_USER_DORMANCY_ROUNDS,
  );

  const roundIds = Array.from(
    { length: currentRoundId - lowestRoundId + 1 },
    (_, index) => currentRoundId - index,
  );

  const rounds = await Promise.all(
    roundIds.map(async (roundId) => {
      const roundResult =
        await contract.read.getRound(BigInt(roundId));
      const round = roundResult[0];

      const voteStart = toSafeInteger(
        round.voteStart,
        `VeBetter round ${roundId} voteStart`,
      );
      const voteDuration = toSafeInteger(
        round.voteDuration,
        `VeBetter round ${roundId} voteDuration`,
      );
      const voteEnd = voteStart + voteDuration;

      if (!Number.isSafeInteger(voteEnd)) {
        throw new Error(
          `VeBetter round ${roundId} end block is invalid.`,
        );
      }

      return {
        roundId,
        voteStart,
        voteEnd,
      } satisfies RoundRecord;
    }),
  );

  const completedRounds = rounds
    .filter(
      (round) =>
        round.voteStart > 0 &&
        round.voteEnd < checkedBlock,
    )
    .sort((left, right) => right.roundId - left.roundId)
    .slice(0, RETURNING_USER_DORMANCY_ROUNDS);

  if (
    completedRounds.length !==
    RETURNING_USER_DORMANCY_ROUNDS
  ) {
    throw new Error(
      'Unable to establish the previous 12 completed VeBetter rounds.',
    );
  }

  const oldestCompletedRound =
    completedRounds.reduce((oldest, round) =>
      round.roundId < oldest.roundId ? round : oldest,
    );
  const newestCompletedRound =
    completedRounds.reduce((newest, round) =>
      round.roundId > newest.roundId ? round : newest,
    );

  return {
    currentRoundId,
    oldestCompletedRoundId: oldestCompletedRound.roundId,
    newestCompletedRoundId: newestCompletedRound.roundId,
    completedRoundIds: completedRounds
      .map((round) => round.roundId)
      .sort((left, right) => left - right),
    dormancyStartBlock: oldestCompletedRound.voteStart,
    newestCompletedRoundEndBlock: newestCompletedRound.voteEnd,
  };
}

async function findFirstRewardEvent({
  thor,
  x2EarnRewardsPoolAddress,
  rewardTopics,
  fromBlock,
  toBlock,
  label,
}: {
  thor: ReturnType<typeof ThorClient.at>;
  x2EarnRewardsPoolAddress: string;
  rewardTopics: ReturnType<
    typeof rewardDistributedEvent.encodeFilterTopics
  >;
  fromBlock: number;
  toBlock: number;
  label: string;
}): Promise<EntryChainEvent | null> {
  if (fromBlock > toBlock) {
    return null;
  }

  const logs = await thor.logs.filterRawEventLogs({
    range: {
      unit: 'block',
      from: fromBlock,
      to: toBlock,
    },
    options: { offset: 0, limit: 1 },
    criteriaSet: [
      {
        address: x2EarnRewardsPoolAddress,
        topic0: getSingleTopic(rewardTopics[0]),
        topic1: getSingleTopic(rewardTopics[1]),
        topic2: getSingleTopic(rewardTopics[2]),
        topic3: getSingleTopic(rewardTopics[3]),
      },
    ],
    order: 'asc',
  });

  return parseChainEvent(
    (logs as RawLog[])[0],
    label,
  );
}

async function findFirstVoteEvent({
  thor,
  xAllocationVotingAddress,
  voteTopics,
  fromBlock,
  toBlock,
  label,
}: {
  thor: ReturnType<typeof ThorClient.at>;
  xAllocationVotingAddress: string;
  voteTopics: ReturnType<
    typeof allocationVoteCastEvent.encodeFilterTopics
  >;
  fromBlock: number;
  toBlock: number;
  label: string;
}): Promise<EntryChainEvent | null> {
  if (fromBlock > toBlock) {
    return null;
  }

  const logs = await thor.logs.filterRawEventLogs({
    range: {
      unit: 'block',
      from: fromBlock,
      to: toBlock,
    },
    options: { offset: 0, limit: 1 },
    criteriaSet: [
      {
        address: xAllocationVotingAddress,
        topic0: getSingleTopic(voteTopics[0]),
        topic1: getSingleTopic(voteTopics[1]),
        topic2: getSingleTopic(voteTopics[2]),
      },
    ],
    order: 'asc',
  });

  return parseChainEvent(
    (logs as RawLog[])[0],
    label,
  );
}

/**
 * Classifies a wallet at the sealed invitation-entry block.
 *
 * NEW: no rewarded/voting VeBetter history before entry.
 * RETURNING: historical rewarded/voting activity exists, but none from the
 * start of the oldest of the previous 12 completed rounds through entry.
 * ACTIVE EXISTING: at least one reward or allocation vote exists in that
 * recent window.
 *
 * The recent scan deliberately continues through the sealed checked block,
 * including any activity in an ongoing round. This prevents a recently active
 * wallet from bypassing the 12-completed-round dormancy rule.
 *
 * This proves rewarded/voting VeBetter history only. It does not claim
 * one-human-one-wallet identity or detect every possible un-rewarded dApp
 * interaction. Any node/indexing/round-read failure throws and fails closed,
 * leaving the invitation unconsumed.
 */
export async function checkVeBetterEntryEligibility({
  walletAddress: rawWalletAddress,
}: {
  walletAddress: string;
}): Promise<EntryEligibilityResult> {
  const walletAddress =
    rawWalletAddress.trim().toLowerCase();

  if (!isValidAddress(walletAddress)) {
    throw new Error(
      'Invalid wallet address for entry eligibility check.',
    );
  }

  const {
    network,
    nodeUrl,
    x2EarnRewardsPoolAddress,
    xAllocationVotingAddress,
  } = getVeBetterNetworkConfig();

  const thor = ThorClient.at(nodeUrl);
  const bestBlock = await thor.blocks.getBestBlockCompressed();

  if (
    !bestBlock ||
    !Number.isSafeInteger(bestBlock.number) ||
    bestBlock.number < 0
  ) {
    throw new Error(
      'Unable to establish a valid VeChain entry-check block.',
    );
  }

  const checkedBlock = bestBlock.number;
  const dormancyWindow = await getDormancyRoundWindow({
    thor,
    xAllocationVotingAddress,
    checkedBlock,
  });

  const rewardTopics =
    rewardDistributedEvent.encodeFilterTopics([
      null,
      walletAddress,
      null,
    ]);
  const voteTopics =
    allocationVoteCastEvent.encodeFilterTopics([
      walletAddress,
      null,
    ]);
  const historicalToBlock =
    dormancyWindow.dormancyStartBlock - 1;

  const [
    priorRewardEvent,
    priorVoteEvent,
    recentRewardEvent,
    recentVoteEvent,
  ] = await Promise.all([
    findFirstRewardEvent({
      thor,
      x2EarnRewardsPoolAddress,
      rewardTopics,
      fromBlock: 0,
      toBlock: historicalToBlock,
      label: 'Historical VeBetter reward',
    }),
    findFirstVoteEvent({
      thor,
      xAllocationVotingAddress,
      voteTopics,
      fromBlock: 0,
      toBlock: historicalToBlock,
      label: 'Historical VeBetter vote',
    }),
    findFirstRewardEvent({
      thor,
      x2EarnRewardsPoolAddress,
      rewardTopics,
      fromBlock: dormancyWindow.dormancyStartBlock,
      toBlock: checkedBlock,
      label: 'Recent VeBetter reward',
    }),
    findFirstVoteEvent({
      thor,
      xAllocationVotingAddress,
      voteTopics,
      fromBlock: dormancyWindow.dormancyStartBlock,
      toBlock: checkedBlock,
      label: 'Recent VeBetter vote',
    }),
  ]);

  const hasRecentActivity = Boolean(
    recentRewardEvent || recentVoteEvent,
  );
  const hasHistoricalActivity = Boolean(
    priorRewardEvent || priorVoteEvent,
  );

  const entryClass: EntryClass =
    hasRecentActivity
      ? 'active_existing_user'
      : hasHistoricalActivity
        ? 'returning_user'
        : 'new_user';

  return {
    outcome:
      entryClass === 'active_existing_user'
        ? 'existing_vebetter_user'
        : 'eligible',
    entryClass,
    network,
    checkedBlock,
    priorRewardEvent,
    priorVoteEvent,
    recentRewardEvent,
    recentVoteEvent,
    dormancyWindow,
  };
}
