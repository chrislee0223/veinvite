import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import { VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

const PAGE_SIZE = 250;
const UINT_WORD_PATTERN = /^[0-9a-f]{64}$/;
const TX_ID_PATTERN = /^0x[0-9a-f]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;

// Reviewed against the official VeBetterDAO config on 2026-08-28.
const X_ALLOCATION_POOL_ADDRESSES: Record<VeBetterNetwork, string> = {
  mainnet: '0x4191776f05f4be4848d3f4d587345078b439c7d3',
  testnet: '0x31884c7c73fa100d4b4d561d10e0fd0079850298',
  'testnet-staging': '0x6f7b4bc19b4dc99005b473b9c45ce2815bbe7533',
};

const allocationRewardsClaimedEvent = new ABIEvent(
  'event AllocationRewardsClaimed(bytes32 indexed appId, uint256 roundId, uint256 totalAmount, address indexed recipient, address caller, uint256 unallocatedAmount, uint256 teamAllocationAmount, uint256 rewardsAllocationAmount)',
);

type RawAllocationLog = {
  data?: string;
  topics?: string[];
  meta?: {
    blockNumber?: number;
    blockTimestamp?: number;
    txID?: string;
  };
};

export type VeBetterAllocationEvidence = {
  network: VeBetterNetwork;
  appId: string;
  veBetterRoundId: string;
  xAllocationPoolAddress: string;
  claimTxId: string;
  claimBlockNumber: number;
  claimBlockTimestamp: string;
  recipientWallet: string;
  callerWallet: string;
  totalAmountWei: string;
  unallocatedAmountWei: string;
  teamAllocationAmountWei: string;
  rewardsAllocationAmountWei: string;
};

export type StoredVeBetterAllocation = {
  id: string;
  network: VeBetterNetwork;
  app_id: string;
  vebetter_round_id: string;
  x_allocation_pool_address: string;
  claim_tx_id: string;
  claim_block_number: string;
  claim_block_timestamp: string;
  recipient_wallet: string;
  caller_wallet: string;
  total_amount_wei: string;
  unallocated_amount_wei: string;
  team_allocation_amount_wei: string;
  rewards_allocation_amount_wei: string;
  observed_at: string;
};

function getSingleTopic(
  topic: `0x${string}` | `0x${string}`[] | null | undefined,
): string | undefined {
  return typeof topic === 'string' ? topic : undefined;
}

function parseUintWord(word: string, label: string): string {
  if (!UINT_WORD_PATTERN.test(word)) {
    throw new Error(`${label} is not a valid ABI uint256 word.`);
  }

  return BigInt(`0x${word}`).toString();
}

function parseAddressWord(word: string, label: string): string {
  if (!UINT_WORD_PATTERN.test(word)) {
    throw new Error(`${label} is not a valid ABI address word.`);
  }

  const address = `0x${word.slice(24)}`.toLowerCase();

  if (!ADDRESS_PATTERN.test(address)) {
    throw new Error(`${label} is not a valid address.`);
  }

  return address;
}

function parseIndexedAddress(topic: string | undefined, label: string): string {
  const normalized = topic?.toLowerCase().replace(/^0x/, '') ?? '';
  return parseAddressWord(normalized, label);
}

function decodeAllocationData(data: string | undefined) {
  const normalized = data?.toLowerCase().replace(/^0x/, '') ?? '';

  // Six non-indexed static ABI values:
  // roundId, totalAmount, caller, unallocated, team allocation, rewards allocation.
  if (normalized.length !== 64 * 6 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error('AllocationRewardsClaimed returned malformed event data.');
  }

  const words = Array.from(
    { length: 6 },
    (_, index) => normalized.slice(index * 64, (index + 1) * 64),
  );

  return {
    veBetterRoundId: parseUintWord(words[0], 'VeBetter round id'),
    totalAmountWei: parseUintWord(words[1], 'Total allocation'),
    callerWallet: parseAddressWord(words[2], 'Allocation caller'),
    unallocatedAmountWei: parseUintWord(words[3], 'Unallocated amount'),
    teamAllocationAmountWei: parseUintWord(words[4], 'Team allocation'),
    rewardsAllocationAmountWei: parseUintWord(words[5], 'Rewards allocation'),
  };
}

function parseLog({
  log,
  network,
  xAllocationPoolAddress,
}: {
  log: RawAllocationLog;
  network: VeBetterNetwork;
  xAllocationPoolAddress: string;
}): VeBetterAllocationEvidence {
  const decoded = decodeAllocationData(log.data);
  const claimTxId = log.meta?.txID?.toLowerCase() ?? '';
  const blockNumber = log.meta?.blockNumber;
  const blockTimestamp = log.meta?.blockTimestamp;
  const appId = log.topics?.[1]?.toLowerCase() ?? '';

  if (appId !== VEINVITE_APP_ID.toLowerCase()) {
    throw new Error('Allocation receipt app id does not match VeInvite.');
  }

  if (!TX_ID_PATTERN.test(claimTxId)) {
    throw new Error('Allocation receipt is missing a valid transaction id.');
  }

  if (
    typeof blockNumber !== 'number' ||
    !Number.isSafeInteger(blockNumber) ||
    blockNumber < 0
  ) {
    throw new Error('Allocation receipt is missing a valid block number.');
  }

  if (
    typeof blockTimestamp !== 'number' ||
    !Number.isSafeInteger(blockTimestamp) ||
    blockTimestamp < 0
  ) {
    throw new Error('Allocation receipt is missing a valid block timestamp.');
  }

  if (BigInt(decoded.veBetterRoundId) < 1n) {
    throw new Error('Allocation receipt returned an invalid VeBetter round id.');
  }

  if (
    BigInt(decoded.totalAmountWei) !==
    BigInt(decoded.teamAllocationAmountWei) +
      BigInt(decoded.rewardsAllocationAmountWei)
  ) {
    throw new Error('Allocation receipt team/reward split does not match its total amount.');
  }

  return {
    network,
    appId,
    veBetterRoundId: decoded.veBetterRoundId,
    xAllocationPoolAddress,
    claimTxId,
    claimBlockNumber: blockNumber,
    claimBlockTimestamp: new Date(blockTimestamp * 1000).toISOString(),
    recipientWallet: parseIndexedAddress(
      log.topics?.[2],
      'Allocation team recipient',
    ),
    callerWallet: decoded.callerWallet,
    totalAmountWei: decoded.totalAmountWei,
    unallocatedAmountWei: decoded.unallocatedAmountWei,
    teamAllocationAmountWei: decoded.teamAllocationAmountWei,
    rewardsAllocationAmountWei: decoded.rewardsAllocationAmountWei,
  };
}

export async function readVeInviteAllocationEvidence({
  fromBlock = 0,
}: {
  fromBlock?: number;
} = {}): Promise<VeBetterAllocationEvidence[]> {
  if (!Number.isSafeInteger(fromBlock) || fromBlock < 0) {
    throw new Error('Allocation scan start block is invalid.');
  }

  const { network, nodeUrl } = getVeBetterNetworkConfig();
  const xAllocationPoolAddress = X_ALLOCATION_POOL_ADDRESSES[network];
  const thor = ThorClient.at(nodeUrl);
  const bestBlock = await thor.blocks.getBestBlockCompressed();

  if (!bestBlock || !Number.isSafeInteger(bestBlock.number) || bestBlock.number < 0) {
    throw new Error('Unable to establish a valid allocation scan head.');
  }

  if (fromBlock > bestBlock.number) {
    return [];
  }

  const topics = allocationRewardsClaimedEvent.encodeFilterTopics([
    VEINVITE_APP_ID,
    null,
  ]);
  const evidence: VeBetterAllocationEvidence[] = [];
  let offset = 0;

  while (true) {
    const logs = await thor.logs.filterRawEventLogs({
      range: {
        unit: 'block',
        from: fromBlock,
        to: bestBlock.number,
      },
      options: {
        offset,
        limit: PAGE_SIZE,
      },
      criteriaSet: [
        {
          address: xAllocationPoolAddress,
          topic0: getSingleTopic(topics[0]),
          topic1: getSingleTopic(topics[1]),
          topic2: getSingleTopic(topics[2]),
        },
      ],
      order: 'asc',
    });

    const rawLogs = logs as RawAllocationLog[];

    for (const log of rawLogs) {
      evidence.push(
        parseLog({
          log,
          network,
          xAllocationPoolAddress,
        }),
      );
    }

    if (rawLogs.length < PAGE_SIZE) {
      break;
    }

    offset += rawLogs.length;
  }

  return evidence;
}

function evidenceMatchesStored(
  evidence: VeBetterAllocationEvidence,
  stored: StoredVeBetterAllocation,
): boolean {
  return (
    stored.network === evidence.network &&
    stored.app_id === evidence.appId.toLowerCase() &&
    String(stored.vebetter_round_id) === evidence.veBetterRoundId &&
    stored.x_allocation_pool_address === evidence.xAllocationPoolAddress.toLowerCase() &&
    stored.claim_tx_id === evidence.claimTxId &&
    String(stored.claim_block_number) === String(evidence.claimBlockNumber) &&
    new Date(stored.claim_block_timestamp).toISOString() === evidence.claimBlockTimestamp &&
    stored.recipient_wallet === evidence.recipientWallet &&
    stored.caller_wallet === evidence.callerWallet &&
    String(stored.total_amount_wei) === evidence.totalAmountWei &&
    String(stored.unallocated_amount_wei) === evidence.unallocatedAmountWei &&
    String(stored.team_allocation_amount_wei) === evidence.teamAllocationAmountWei &&
    String(stored.rewards_allocation_amount_wei) === evidence.rewardsAllocationAmountWei
  );
}

async function loadStoredReceipt(
  network: VeBetterNetwork,
  appId: string,
  veBetterRoundId: string,
): Promise<StoredVeBetterAllocation | null> {
  const { data, error } = await supabaseAdmin
    .from('vebetter_round_allocations')
    .select(
      'id, network, app_id, vebetter_round_id, x_allocation_pool_address, claim_tx_id, claim_block_number, claim_block_timestamp, recipient_wallet, caller_wallet, total_amount_wei, unallocated_amount_wei, team_allocation_amount_wei, rewards_allocation_amount_wei, observed_at',
    )
    .eq('network', network)
    .eq('app_id', appId.toLowerCase())
    .eq('vebetter_round_id', veBetterRoundId)
    .maybeSingle();

  if (error) {
    throw new Error(`Stored VeBetter allocation could not be loaded: ${error.message}`);
  }

  return (data as StoredVeBetterAllocation | null) ?? null;
}

async function persistEvidence(
  evidence: VeBetterAllocationEvidence,
): Promise<{ receipt: StoredVeBetterAllocation; inserted: boolean }> {
  const existing = await loadStoredReceipt(
    evidence.network,
    evidence.appId,
    evidence.veBetterRoundId,
  );

  if (existing) {
    if (!evidenceMatchesStored(evidence, existing)) {
      throw new Error(
        `Stored VeBetter allocation evidence for round ${evidence.veBetterRoundId} does not match the chain.`,
      );
    }

    return { receipt: existing, inserted: false };
  }

  const row = {
    network: evidence.network,
    app_id: evidence.appId.toLowerCase(),
    vebetter_round_id: evidence.veBetterRoundId,
    x_allocation_pool_address: evidence.xAllocationPoolAddress.toLowerCase(),
    claim_tx_id: evidence.claimTxId,
    claim_block_number: evidence.claimBlockNumber,
    claim_block_timestamp: evidence.claimBlockTimestamp,
    recipient_wallet: evidence.recipientWallet,
    caller_wallet: evidence.callerWallet,
    total_amount_wei: evidence.totalAmountWei,
    unallocated_amount_wei: evidence.unallocatedAmountWei,
    team_allocation_amount_wei: evidence.teamAllocationAmountWei,
    rewards_allocation_amount_wei: evidence.rewardsAllocationAmountWei,
  };

  const inserted = await supabaseAdmin
    .from('vebetter_round_allocations')
    .insert(row)
    .select(
      'id, network, app_id, vebetter_round_id, x_allocation_pool_address, claim_tx_id, claim_block_number, claim_block_timestamp, recipient_wallet, caller_wallet, total_amount_wei, unallocated_amount_wei, team_allocation_amount_wei, rewards_allocation_amount_wei, observed_at',
    )
    .single();

  if (!inserted.error && inserted.data) {
    return {
      receipt: inserted.data as StoredVeBetterAllocation,
      inserted: true,
    };
  }

  // Cron and an operator action can race. A unique conflict is safe only when
  // the row that won the race exactly matches the same immutable chain event.
  if (inserted.error?.code === '23505') {
    const raced = await loadStoredReceipt(
      evidence.network,
      evidence.appId,
      evidence.veBetterRoundId,
    );

    if (raced && evidenceMatchesStored(evidence, raced)) {
      return { receipt: raced, inserted: false };
    }
  }

  throw new Error(
    `VeBetter allocation evidence could not be stored: ${inserted.error?.message ?? 'unknown insert failure'}`,
  );
}

export async function syncVeInviteAllocationReceipts() {
  const { network } = getVeBetterNetworkConfig();
  const appId = VEINVITE_APP_ID.toLowerCase();
  const latestStored = await supabaseAdmin
    .from('vebetter_round_allocations')
    .select('claim_block_number')
    .eq('network', network)
    .eq('app_id', appId)
    .order('claim_block_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestStored.error) {
    throw new Error(
      `Latest stored allocation block could not be loaded: ${latestStored.error.message}`,
    );
  }

  const fromBlock = latestStored.data?.claim_block_number
    ? Number(latestStored.data.claim_block_number)
    : 0;

  if (!Number.isSafeInteger(fromBlock) || fromBlock < 0) {
    throw new Error('Stored allocation block is invalid.');
  }

  const chainEvidence = await readVeInviteAllocationEvidence({ fromBlock });
  let insertedCount = 0;

  for (const evidence of chainEvidence) {
    const result = await persistEvidence(evidence);
    if (result.inserted) {
      insertedCount += 1;
    }
  }

  const latest = await supabaseAdmin
    .from('vebetter_round_allocations')
    .select(
      'id, network, app_id, vebetter_round_id, x_allocation_pool_address, claim_tx_id, claim_block_number, claim_block_timestamp, recipient_wallet, caller_wallet, total_amount_wei, unallocated_amount_wei, team_allocation_amount_wei, rewards_allocation_amount_wei, observed_at',
    )
    .eq('network', network)
    .eq('app_id', appId)
    .order('vebetter_round_id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest.error) {
    throw new Error(`Latest VeBetter allocation could not be loaded: ${latest.error.message}`);
  }

  return {
    network,
    appId,
    scannedFromBlock: fromBlock,
    observedClaims: chainEvidence.length,
    insertedCount,
    latestReceipt: (latest.data as StoredVeBetterAllocation | null) ?? null,
  } as const;
}
