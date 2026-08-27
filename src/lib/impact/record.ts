import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import { supabaseAdmin } from '@/lib/supabaseServer';
import type { QualifyingRewardEvent } from '@/lib/vebetter/activity';
import {
  createTransactionIndexResolver,
} from '@/lib/vebetter/eventOrder';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';
import type { Vot3ConversionEvent } from '@/lib/vebetter/vot3Conversion';

const allocationVoteCastEvent = new ABIEvent(
  'event AllocationVoteCast(address indexed voter, uint256 indexed roundId, bytes32[] appsIds, uint256[] voteWeights)',
);

type RawVoteLog = {
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

function toIsoTimestamp(unixSeconds: number): string {
  if (
    !Number.isSafeInteger(unixSeconds) ||
    unixSeconds < 0
  ) {
    throw new Error('Invalid VeChain block timestamp.');
  }

  return new Date(unixSeconds * 1000).toISOString();
}

export async function recordQualifyingRewardImpact(args: {
  inviteCode: string;
  network: VeBetterNetwork | null;
  walletAddress: string;
  events: QualifyingRewardEvent[];
}): Promise<boolean> {
  if (!args.network) {
    console.error(
      'Refusing to record dApp impact without invitation network provenance.',
    );
    return false;
  }

  if (args.events.length === 0) {
    return true;
  }

  const rows = args.events.map((event) => ({
    event_key:
      `reward:${args.network}:${args.inviteCode}:${event.txId}:${event.appId}`.toLowerCase(),
    invite_code: args.inviteCode,
    network: args.network,
    wallet_address: args.walletAddress.toLowerCase(),
    event_type: 'DAPP_REWARD',
    tx_id: event.txId.toLowerCase(),
    block_number: event.blockNumber,
    block_timestamp: toIsoTimestamp(event.blockTimestamp),
    tx_index: event.txIndex,
    clause_index: event.clauseIndex,
    app_id: event.appId.toLowerCase(),
    vote_round_id: null,
    amount_wei: null,
  }));

  const { error } = await supabaseAdmin
    .from('invite_impact_events')
    .upsert(rows, {
      onConflict: 'event_key',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error(
      'Failed to persist qualifying dApp impact events:',
      error,
    );
    return false;
  }

  return true;
}

export async function recordVot3ConversionImpact(args: {
  inviteCode: string;
  network: VeBetterNetwork | null;
  walletAddress: string;
  events: Vot3ConversionEvent[];
}): Promise<boolean> {
  if (!args.network) {
    console.error(
      'Refusing to record VOT3 conversion impact without invitation network provenance.',
    );
    return false;
  }

  if (args.events.length === 0) {
    return true;
  }

  const rows = args.events.map((event) => ({
    event_key:
      `vot3-conversion:${args.network}:${args.inviteCode}:${event.txId}:${event.clauseIndex}:${event.amountWei}`.toLowerCase(),
    invite_code: args.inviteCode,
    network: args.network,
    wallet_address: args.walletAddress.toLowerCase(),
    event_type: 'VOT3_CONVERSION',
    tx_id: event.txId.toLowerCase(),
    block_number: event.blockNumber,
    block_timestamp:
      toIsoTimestamp(event.blockTimestamp),
    tx_index: event.txIndex,
    clause_index: event.clauseIndex,
    app_id: null,
    vote_round_id: null,
    amount_wei: event.amountWei,
  }));

  const { error } = await supabaseAdmin
    .from('invite_impact_events')
    .upsert(rows, {
      onConflict: 'event_key',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error(
      'Failed to persist VOT3 conversion impact events:',
      error,
    );
    return false;
  }

  return true;
}

async function resolveVoteExecutionPosition(args: {
  walletAddress: string;
  txId: string;
  blockNumber: number;
  voteRoundId: number;
}): Promise<{
  txIndex: number;
  clauseIndex: number;
}> {
  const {
    nodeUrl,
    xAllocationVotingAddress,
  } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const resolveTxIndex =
    createTransactionIndexResolver(thor);
  const topics =
    allocationVoteCastEvent.encodeFilterTopics([
      args.walletAddress,
      BigInt(args.voteRoundId),
    ]);

  const logs = await thor.logs.filterRawEventLogs({
    range: {
      unit: 'block',
      from: args.blockNumber,
      to: args.blockNumber,
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

  const normalizedTxId = args.txId.toLowerCase();
  const matched = (logs as RawVoteLog[]).find(
    (log) =>
      log.meta?.txID?.toLowerCase() === normalizedTxId,
  );

  const clauseIndex = matched?.meta?.clauseIndex;
  if (
    typeof clauseIndex !== 'number' ||
    !Number.isSafeInteger(clauseIndex) ||
    clauseIndex < 0
  ) {
    throw new Error(
      'Unable to resolve governance vote clause index.',
    );
  }

  return {
    txIndex: await resolveTxIndex(
      args.blockNumber,
      normalizedTxId,
    ),
    clauseIndex,
  };
}

export async function recordVoteImpact(args: {
  inviteCode: string;
  network: VeBetterNetwork | null;
  walletAddress: string;
  txId: string;
  blockNumber: number;
  blockTimestamp: number;
  voteRoundId: number;
}): Promise<boolean> {
  if (!args.network) {
    console.error(
      'Refusing to record vote impact without invitation network provenance.',
    );
    return false;
  }

  const normalizedTxId = args.txId.toLowerCase();

  let position: {
    txIndex: number;
    clauseIndex: number;
  };

  try {
    position = await resolveVoteExecutionPosition({
      walletAddress: args.walletAddress,
      txId: normalizedTxId,
      blockNumber: args.blockNumber,
      voteRoundId: args.voteRoundId,
    });
  } catch (error) {
    console.error(
      'Failed to resolve governance vote execution position:',
      error,
    );
    return false;
  }

  const { error } = await supabaseAdmin
    .from('invite_impact_events')
    .upsert(
      {
        event_key:
          `vote:${args.network}:${args.inviteCode}:${normalizedTxId}:${args.voteRoundId}`.toLowerCase(),
        invite_code: args.inviteCode,
        network: args.network,
        wallet_address: args.walletAddress.toLowerCase(),
        event_type: 'ALLOCATION_VOTE',
        tx_id: normalizedTxId,
        block_number: args.blockNumber,
        block_timestamp:
          toIsoTimestamp(args.blockTimestamp),
        tx_index: position.txIndex,
        clause_index: position.clauseIndex,
        app_id: null,
        vote_round_id: args.voteRoundId,
        amount_wei: null,
      },
      {
        onConflict: 'event_key',
        ignoreDuplicates: false,
      },
    );

  if (error) {
    console.error(
      'Failed to persist governance vote impact event:',
      error,
    );
    return false;
  }

  return true;
}
