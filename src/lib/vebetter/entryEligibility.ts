import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

const rewardDistributedEvent = new ABIEvent(
  'event RewardDistributed(uint256 amount, bytes32 indexed appId, address indexed receiver, string proof, address indexed distributor)',
);

const allocationVoteCastEvent = new ABIEvent(
  'event AllocationVoteCast(address indexed voter, uint256 indexed roundId, bytes32[] appsIds, uint256[] voteWeights)',
);

type RawLog = {
  meta?: {
    blockNumber?: number;
    txID?: string;
  };
};

type PriorEvent = {
  txId: string;
  blockNumber: number;
};

export type EntryEligibilityResult = {
  outcome:
    | 'eligible'
    | 'existing_vebetter_user';
  network: VeBetterNetwork;
  checkedBlock: number;
  priorRewardEvent: PriorEvent | null;
  priorVoteEvent: PriorEvent | null;
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
  return typeof topic === 'string'
    ? topic
    : undefined;
}

function parsePriorEvent(
  log: RawLog | undefined,
  label: string,
): PriorEvent | null {
  if (!log) {
    return null;
  }

  const txId =
    log.meta?.txID?.toLowerCase();
  const blockNumber =
    log.meta?.blockNumber;

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

  return {
    txId,
    blockNumber,
  };
}

/**
 * Defines VeInvite's auditable "new to VeBetter" entry boundary.
 *
 * The wallet is accepted only if, through the sealed best block used as the
 * invitation activation boundary, there is no prior X2EarnRewardsPool
 * RewardDistributed event to the wallet and no prior allocation-governance
 * vote by the wallet.
 *
 * This intentionally proves "no prior rewarded/voting VeBetter history". It
 * does not claim one-human-one-wallet identity. Any node/indexing failure
 * throws and therefore fails closed: the invitation is not consumed.
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

  const bestBlock =
    await thor.blocks.getBestBlockCompressed();

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

  const [rewardLogs, voteLogs] = await Promise.all([
    thor.logs.filterRawEventLogs({
      range: {
        unit: 'block',
        from: 0,
        to: checkedBlock,
      },
      options: {
        offset: 0,
        limit: 1,
      },
      criteriaSet: [
        {
          address:
            x2EarnRewardsPoolAddress,
          topic0:
            getSingleTopic(
              rewardTopics[0],
            ),
          topic1:
            getSingleTopic(
              rewardTopics[1],
            ),
          topic2:
            getSingleTopic(
              rewardTopics[2],
            ),
          topic3:
            getSingleTopic(
              rewardTopics[3],
            ),
        },
      ],
      order: 'asc',
    }),
    thor.logs.filterRawEventLogs({
      range: {
        unit: 'block',
        from: 0,
        to: checkedBlock,
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
              voteTopics[0],
            ),
          topic1:
            getSingleTopic(
              voteTopics[1],
            ),
          topic2:
            getSingleTopic(
              voteTopics[2],
            ),
        },
      ],
      order: 'asc',
    }),
  ]);

  const priorRewardEvent =
    parsePriorEvent(
      (rewardLogs as RawLog[])[0],
      'VeBetter reward',
    );

  const priorVoteEvent =
    parsePriorEvent(
      (voteLogs as RawLog[])[0],
      'VeBetter vote',
    );

  return {
    outcome:
      priorRewardEvent || priorVoteEvent
        ? 'existing_vebetter_user'
        : 'eligible',
    network,
    checkedBlock,
    priorRewardEvent,
    priorVoteEvent,
  };
}
