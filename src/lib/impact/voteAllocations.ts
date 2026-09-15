import { ABIEvent, Hex } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

export type VoteAllocation = {
  allocationIndex: number;
  appId: string;
  voteWeight: string;
};

const allocationVoteCastEvent = new ABIEvent(
  'event AllocationVoteCast(address indexed voter, uint256 indexed roundId, bytes32[] appsIds, uint256[] voteWeights)',
);

type RawVoteLog = {
  data?: string;
  topics?: string[];
  meta?: {
    blockNumber?: number;
    txID?: string;
    clauseIndex?: number;
  };
};

function getSingleTopic(
  topic:
    | `0x${string}`
    | `0x${string}`[]
    | null
    | undefined,
): string | undefined {
  return typeof topic === 'string' ? topic : undefined;
}

function isValidTxId(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isValidWalletAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isValidAppId(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function normalizeVoteWeight(
  value: unknown,
): string | null {
  if (typeof value === 'bigint') {
    return value >= 0n ? value.toString() : null;
  }

  if (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return String(value);
  }

  if (
    typeof value === 'string' &&
    /^\d+$/.test(value)
  ) {
    return BigInt(value).toString();
  }

  return null;
}

function decodeVoteAllocations(
  log: RawVoteLog,
): VoteAllocation[] | null {
  if (
    !log.data ||
    !log.topics ||
    log.topics.length < 3
  ) {
    return null;
  }

  try {
    const decoded =
      allocationVoteCastEvent.decodeEventLogAsArray({
        data: Hex.of(log.data),
        topics: log.topics.map((topic) => Hex.of(topic)),
      });
    const appIds = decoded[2];
    const voteWeights = decoded[3];

    if (
      !Array.isArray(appIds) ||
      !Array.isArray(voteWeights) ||
      appIds.length !== voteWeights.length
    ) {
      return null;
    }

    const allocations: VoteAllocation[] = [];

    for (
      let index = 0;
      index < appIds.length;
      index += 1
    ) {
      const appId = appIds[index];
      const voteWeight =
        normalizeVoteWeight(voteWeights[index]);

      if (
        typeof appId !== 'string' ||
        !isValidAppId(appId) ||
        voteWeight === null
      ) {
        return null;
      }

      allocations.push({
        allocationIndex: index,
        appId: appId.toLowerCase(),
        voteWeight,
      });
    }

    return allocations;
  } catch (error) {
    console.warn(
      'Failed to decode governance vote allocations.',
      error,
    );
    return null;
  }
}

export async function readMissionVoteAllocationsFromChain({
  walletAddress,
  txId,
  blockNumber,
  voteRoundId,
}: {
  walletAddress: string;
  txId: string;
  blockNumber: number;
  voteRoundId: number;
}): Promise<{
  clauseIndex: number;
  allocations: VoteAllocation[];
}> {
  const normalizedWallet =
    walletAddress.toLowerCase();
  const normalizedTxId = txId.toLowerCase();

  if (
    !isValidWalletAddress(normalizedWallet) ||
    !isValidTxId(normalizedTxId) ||
    !Number.isSafeInteger(blockNumber) ||
    blockNumber < 0 ||
    !Number.isSafeInteger(voteRoundId) ||
    voteRoundId < 0
  ) {
    throw new Error(
      'Invalid governance vote evidence for allocation decoding.',
    );
  }

  const {
    nodeUrl,
    xAllocationVotingAddress,
  } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const topics =
    allocationVoteCastEvent.encodeFilterTopics([
      normalizedWallet,
      BigInt(voteRoundId),
    ]);

  const logs = await thor.logs.filterRawEventLogs({
    range: {
      unit: 'block',
      from: blockNumber,
      to: blockNumber,
    },
    options: {
      offset: 0,
      limit: 100,
    },
    criteriaSet: [
      {
        address: xAllocationVotingAddress,
        topic0: getSingleTopic(topics[0]),
        topic1: getSingleTopic(topics[1]),
        topic2: getSingleTopic(topics[2]),
      },
    ],
    order: 'asc',
  });

  const matched = (logs as RawVoteLog[]).find(
    (log) =>
      log.meta?.txID?.toLowerCase() === normalizedTxId,
  );
  const clauseIndex = matched?.meta?.clauseIndex;

  if (
    !matched ||
    typeof clauseIndex !== 'number' ||
    !Number.isSafeInteger(clauseIndex) ||
    clauseIndex < 0
  ) {
    throw new Error(
      'Unable to resolve the exact governance vote event.',
    );
  }

  const allocations =
    decodeVoteAllocations(matched);

  if (!allocations || allocations.length === 0) {
    throw new Error(
      'Governance vote event was found, but its allocations could not be decoded.',
    );
  }

  return {
    clauseIndex,
    allocations,
  };
}

export async function recordMissionVoteAllocations({
  inviteCode,
  network,
  walletAddress,
  txId,
  blockNumber,
  blockTimestamp,
  clauseIndex,
  voteRoundId,
  allocations,
}: {
  inviteCode: string;
  network: VeBetterNetwork;
  walletAddress: string;
  txId: string;
  blockNumber: number;
  blockTimestamp: number;
  clauseIndex: number;
  voteRoundId: number;
  allocations: VoteAllocation[];
}): Promise<boolean> {
  const normalizedWallet =
    walletAddress.toLowerCase();
  const normalizedTxId = txId.toLowerCase();

  if (
    !inviteCode ||
    !isValidWalletAddress(normalizedWallet) ||
    !isValidTxId(normalizedTxId) ||
    !Number.isSafeInteger(blockNumber) ||
    blockNumber < 0 ||
    !Number.isSafeInteger(blockTimestamp) ||
    blockTimestamp < 0 ||
    !Number.isSafeInteger(clauseIndex) ||
    clauseIndex < 0 ||
    !Number.isSafeInteger(voteRoundId) ||
    voteRoundId < 0 ||
    allocations.length === 0
  ) {
    console.warn(
      'Skipping invalid mission vote allocation payload.',
      { inviteCode, txId: normalizedTxId },
    );
    return false;
  }

  for (const allocation of allocations) {
    if (
      !Number.isSafeInteger(
        allocation.allocationIndex,
      ) ||
      allocation.allocationIndex < 0 ||
      !isValidAppId(allocation.appId) ||
      !/^\d+$/.test(allocation.voteWeight)
    ) {
      console.warn(
        'Skipping malformed decoded vote allocation.',
        {
          inviteCode,
          txId: normalizedTxId,
          allocationIndex:
            allocation.allocationIndex,
        },
      );
      return false;
    }
  }

  const {
    data: invitation,
    error: invitationError,
  } = await supabaseAdmin
    .from('invitations')
    .select('id')
    .eq('invite_code', inviteCode)
    .eq('invitee_wallet', normalizedWallet)
    .maybeSingle();

  if (invitationError) {
    console.error(
      'Failed to resolve invitation for vote allocations:',
      invitationError,
    );
    return false;
  }

  if (!invitation?.id) {
    console.warn(
      'No invitation matched decoded vote allocations.',
      {
        inviteCode,
        walletAddress: normalizedWallet,
      },
    );
    return false;
  }

  const occurredAt = new Date(
    blockTimestamp * 1000,
  ).toISOString();

  const rows = allocations.map(
    (allocation) => ({
      invitation_id: invitation.id,
      invite_code: inviteCode,
      network,
      wallet_address: normalizedWallet,
      tx_id: normalizedTxId,
      block_number: blockNumber,
      clause_index: clauseIndex,
      round_id: voteRoundId,
      allocation_index:
        allocation.allocationIndex,
      app_id:
        allocation.appId.toLowerCase(),
      vote_weight: allocation.voteWeight,
      vote_kind: 'MISSION_QUALIFYING',
      occurred_at: occurredAt,
    }),
  );

  const { error } = await supabaseAdmin
    .from('invite_vote_allocations')
    .upsert(rows, {
      onConflict:
        'network,tx_id,clause_index,allocation_index',
    });

  if (error) {
    console.error(
      'Failed to persist mission vote allocations:',
      error,
    );
    return false;
  }

  return true;
}
