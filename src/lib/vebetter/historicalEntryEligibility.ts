import 'server-only';

import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  ENTRY_ELIGIBILITY_RULE_VERSION,
  RETURNING_USER_DORMANCY_ROUNDS,
} from '@/lib/vebetter/entryEligibility';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

const PAGE_SIZE = 1000;

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
  data?: string;
  meta?: {
    blockNumber?: number;
    txID?: string;
  };
};

type ChainEvent = {
  txId: string;
  blockNumber: number;
};

type RoundRecord = {
  roundId: number;
  voteStart: number;
  voteEnd: number;
};

export type HistoricalEntryClass =
  | 'NEW'
  | 'RETURNING'
  | 'ACTIVE_EXISTING';

export type HistoricalEntryEligibilityResult = {
  network: VeBetterNetwork;
  checkedBlock: number;
  ruleVersion: string;
  entryClass: HistoricalEntryClass;
  outcome: 'ELIGIBLE' | 'EXISTING_VEBETTER_USER';
  priorRewardEvent: ChainEvent | null;
  priorVoteEvent: ChainEvent | null;
  recentRewardEvent: ChainEvent | null;
  recentVoteEvent: ChainEvent | null;
  dormancyWindow: {
    currentRoundId: number;
    oldestCompletedRoundId: number;
    newestCompletedRoundId: number;
    completedRoundIds: number[];
    dormancyStartBlock: number;
    newestCompletedRoundEndBlock: number;
  };
};

function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

function getSingleTopic(
  topic: `0x${string}` | `0x${string}`[] | null | undefined,
): string | undefined {
  return typeof topic === 'string' ? topic : undefined;
}

function toSafeInteger(value: unknown, label: string): number {
  let parsed: number;

  if (typeof value === 'bigint') {
    parsed = Number(value);
  } else if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    parsed = Number(value);
  } else {
    throw new Error(`${label} has an unsupported chain value type.`);
  }

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} is not a safe non-negative integer.`);
  }

  return parsed;
}

function readRoundTupleValue(
  round: unknown,
  fieldName: 'voteStart' | 'voteDuration',
  tupleIndex: 1 | 2,
): unknown {
  if (Array.isArray(round)) return round[tupleIndex];

  if (round !== null && typeof round === 'object') {
    const record = round as Record<string | number, unknown>;
    return record[fieldName] ?? record[tupleIndex];
  }

  return undefined;
}

function parseRoundRecord(
  roundId: number,
  roundResult: readonly unknown[],
): RoundRecord {
  const round = roundResult[0] as unknown;
  const voteStart = toSafeInteger(
    readRoundTupleValue(round, 'voteStart', 1),
    `VeBetterDAO round ${roundId} voteStart`,
  );
  const voteDuration = toSafeInteger(
    readRoundTupleValue(round, 'voteDuration', 2),
    `VeBetterDAO round ${roundId} voteDuration`,
  );
  const voteEnd = voteStart + voteDuration;

  if (!Number.isSafeInteger(voteEnd)) {
    throw new Error(`VeBetterDAO round ${roundId} end block is invalid.`);
  }

  return { roundId, voteStart, voteEnd };
}

function parseChainEvent(
  log: RawLog | undefined,
  label: string,
): ChainEvent | null {
  if (!log) return null;

  const txId = log.meta?.txID?.toLowerCase();
  const blockNumber = log.meta?.blockNumber;

  if (
    !txId ||
    !/^0x[0-9a-f]{64}$/.test(txId) ||
    typeof blockNumber !== 'number' ||
    !Number.isSafeInteger(blockNumber) ||
    blockNumber < 0
  ) {
    throw new Error(`${label} returned malformed chain metadata.`);
  }

  return { txId, blockNumber };
}

function parseRewardAmountWei(log: RawLog, label: string): bigint {
  const normalized =
    log.data?.trim().toLowerCase().replace(/^0x/, '') ?? '';

  if (normalized.length < 64 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`${label} returned malformed reward amount data.`);
  }

  return BigInt(`0x${normalized.slice(0, 64)}`);
}

async function findFirstRewardEvent({
  thor,
  contractAddress,
  topics,
  fromBlock,
  toBlock,
  label,
}: {
  thor: ReturnType<typeof ThorClient.at>;
  contractAddress: string;
  topics: ReturnType<typeof rewardDistributedEvent.encodeFilterTopics>;
  fromBlock: number;
  toBlock: number;
  label: string;
}): Promise<ChainEvent | null> {
  if (fromBlock > toBlock) return null;

  let offset = 0;

  while (true) {
    const logs = await thor.logs.filterRawEventLogs({
      range: { unit: 'block', from: fromBlock, to: toBlock },
      options: { offset, limit: PAGE_SIZE },
      criteriaSet: [
        {
          address: contractAddress,
          topic0: getSingleTopic(topics[0]),
          topic1: getSingleTopic(topics[1]),
          topic2: getSingleTopic(topics[2]),
          topic3: getSingleTopic(topics[3]),
        },
      ],
      order: 'asc',
    });

    const rawLogs = logs as RawLog[];

    for (const log of rawLogs) {
      if (parseRewardAmountWei(log, label) > 0n) {
        return parseChainEvent(log, label);
      }
    }

    if (rawLogs.length < PAGE_SIZE) return null;
    offset += PAGE_SIZE;
  }
}

async function findFirstVoteEvent({
  thor,
  contractAddress,
  topics,
  fromBlock,
  toBlock,
  label,
}: {
  thor: ReturnType<typeof ThorClient.at>;
  contractAddress: string;
  topics: ReturnType<typeof allocationVoteCastEvent.encodeFilterTopics>;
  fromBlock: number;
  toBlock: number;
  label: string;
}): Promise<ChainEvent | null> {
  if (fromBlock > toBlock) return null;

  const logs = await thor.logs.filterRawEventLogs({
    range: { unit: 'block', from: fromBlock, to: toBlock },
    options: { offset: 0, limit: 1 },
    criteriaSet: [
      {
        address: contractAddress,
        topic0: getSingleTopic(topics[0]),
        topic1: getSingleTopic(topics[1]),
        topic2: getSingleTopic(topics[2]),
      },
    ],
    order: 'asc',
  });

  return parseChainEvent((logs as RawLog[])[0], label);
}

async function getHistoricalDormancyWindow({
  thor,
  xAllocationVotingAddress,
  checkedBlock,
}: {
  thor: ReturnType<typeof ThorClient.at>;
  xAllocationVotingAddress: string;
  checkedBlock: number;
}) {
  const contract = thor.contracts.load(
    xAllocationVotingAddress,
    xAllocationVotingRoundAbi,
  );
  const currentRoundResult = await contract.read.currentRoundId();
  const currentRoundId = toSafeInteger(
    currentRoundResult[0],
    'Current VeBetterDAO round id',
  );

  const completedRounds: RoundRecord[] = [];

  for (
    let roundId = currentRoundId;
    roundId >= 1 && completedRounds.length < RETURNING_USER_DORMANCY_ROUNDS;
    roundId -= 1
  ) {
    const roundResult = await contract.read.getRound(BigInt(roundId));
    const round = parseRoundRecord(
      roundId,
      roundResult as readonly unknown[],
    );

    if (round.voteStart > 0 && round.voteEnd < checkedBlock) {
      completedRounds.push(round);
    }
  }

  if (completedRounds.length !== RETURNING_USER_DORMANCY_ROUNDS) {
    throw new Error(
      'Unable to establish the previous 12 completed VeBetterDAO rounds at the historical entry block.',
    );
  }

  const sorted = [...completedRounds].sort(
    (left, right) => left.roundId - right.roundId,
  );
  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];

  return {
    currentRoundId,
    oldestCompletedRoundId: oldest.roundId,
    newestCompletedRoundId: newest.roundId,
    completedRoundIds: sorted.map((round) => round.roundId),
    dormancyStartBlock: oldest.voteStart,
    newestCompletedRoundEndBlock: newest.voteEnd,
  };
}

export async function checkHistoricalVeBetterEntryEligibility({
  walletAddress: rawWalletAddress,
  checkedBlock,
}: {
  walletAddress: string;
  checkedBlock: number;
}): Promise<HistoricalEntryEligibilityResult> {
  const walletAddress = rawWalletAddress.trim().toLowerCase();

  if (!isValidAddress(walletAddress)) {
    throw new Error('Invalid wallet address for historical entry eligibility check.');
  }

  if (!Number.isSafeInteger(checkedBlock) || checkedBlock < 1) {
    throw new Error('Historical entry block must be a positive safe integer.');
  }

  const {
    network,
    nodeUrl,
    x2EarnRewardsPoolAddress,
    xAllocationVotingAddress,
  } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const bestBlock = await thor.blocks.getBestBlockCompressed();

  if (!bestBlock || checkedBlock > bestBlock.number) {
    throw new Error('Historical entry block is not sealed on the reviewed chain.');
  }

  const dormancyWindow = await getHistoricalDormancyWindow({
    thor,
    xAllocationVotingAddress,
    checkedBlock,
  });
  const rewardTopics = rewardDistributedEvent.encodeFilterTopics([
    null,
    walletAddress,
    null,
  ]);
  const voteTopics = allocationVoteCastEvent.encodeFilterTopics([
    walletAddress,
    null,
  ]);
  const historicalToBlock = dormancyWindow.dormancyStartBlock - 1;

  const [
    priorRewardEvent,
    priorVoteEvent,
    recentRewardEvent,
    recentVoteEvent,
  ] = await Promise.all([
    findFirstRewardEvent({
      thor,
      contractAddress: x2EarnRewardsPoolAddress,
      topics: rewardTopics,
      fromBlock: 0,
      toBlock: historicalToBlock,
      label: 'Historical VeBetterDAO reward',
    }),
    findFirstVoteEvent({
      thor,
      contractAddress: xAllocationVotingAddress,
      topics: voteTopics,
      fromBlock: 0,
      toBlock: historicalToBlock,
      label: 'Historical VeBetterDAO vote',
    }),
    findFirstRewardEvent({
      thor,
      contractAddress: x2EarnRewardsPoolAddress,
      topics: rewardTopics,
      fromBlock: dormancyWindow.dormancyStartBlock,
      toBlock: checkedBlock,
      label: 'Recent VeBetterDAO reward',
    }),
    findFirstVoteEvent({
      thor,
      contractAddress: xAllocationVotingAddress,
      topics: voteTopics,
      fromBlock: dormancyWindow.dormancyStartBlock,
      toBlock: checkedBlock,
      label: 'Recent VeBetterDAO vote',
    }),
  ]);

  const hasRecentActivity = Boolean(recentRewardEvent || recentVoteEvent);
  const hasHistoricalActivity = Boolean(priorRewardEvent || priorVoteEvent);
  const entryClass: HistoricalEntryClass = hasRecentActivity
    ? 'ACTIVE_EXISTING'
    : hasHistoricalActivity
      ? 'RETURNING'
      : 'NEW';

  return {
    network,
    checkedBlock,
    ruleVersion: ENTRY_ELIGIBILITY_RULE_VERSION,
    entryClass,
    outcome:
      entryClass === 'ACTIVE_EXISTING'
        ? 'EXISTING_VEBETTER_USER'
        : 'ELIGIBLE',
    priorRewardEvent,
    priorVoteEvent,
    recentRewardEvent,
    recentVoteEvent,
    dormancyWindow,
  };
}
