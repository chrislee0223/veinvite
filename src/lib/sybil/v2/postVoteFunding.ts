import 'server-only';

import { ThorClient } from '@vechain/sdk-network';

import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const VTHO_ADDRESS =
  '0x0000000000000000000000000000456e65726779';
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/u;
const PAGE_SIZE = 200;
const MAX_LOGS_PER_ASSET = 1_000;
const MAX_SOURCES_PER_ASSET = 40;
const MAX_BLOCK_SPAN = 90 * 24 * 60 * 6;

export type PostVoteFundingSource = {
  asset: 'B3TR' | 'VTHO';
  sender: string;
  transferCount: number;
  totalAmountWei: string;
  firstBlock: number;
  lastBlock: number;
  firstTxId: string;
  lastTxId: string;
};

export type PostVoteFundingObservation = {
  fromBlock: number;
  throughBlock: number;
  inboundB3trTransfers: number;
  inboundVthoTransfers: number;
  excludedProtocolTransfers: number;
  sourceCount: number;
  sourcesTruncated: boolean;
  sources: PostVoteFundingSource[];
};

type EventLog = {
  topics?: string[];
  data?: string;
  meta?: {
    blockNumber?: number;
    txID?: string;
  };
};

function addressTopic(wallet: string): string {
  return `0x${'0'.repeat(24)}${wallet.slice(2)}`;
}

function parseTransfer(
  event: EventLog,
  asset: 'B3TR' | 'VTHO',
  fromBlock: number,
  throughBlock: number,
): (Omit<PostVoteFundingSource, 'transferCount' | 'totalAmountWei'> & {
  amount: bigint;
}) | null {
  const senderTopic = event.topics?.[1]?.toLowerCase();
  const block = event.meta?.blockNumber;
  const tx = event.meta?.txID?.toLowerCase();
  const data = event.data?.toLowerCase();
  if (
    !senderTopic ||
    !/^0x[0-9a-f]{64}$/u.test(senderTopic) ||
    !Number.isSafeInteger(block) ||
    (block as number) < fromBlock ||
    (block as number) > throughBlock ||
    !tx ||
    !/^0x[0-9a-f]{64}$/u.test(tx) ||
    !data ||
    !/^0x[0-9a-f]{64}$/u.test(data)
  ) {
    throw new Error('Post-vote funding observation received invalid chain event data.');
  }

  const sender = `0x${senderTopic.slice(-40)}`;
  const amount = BigInt(data);
  if (amount <= 0n) return null;

  return {
    asset,
    sender,
    amount,
    firstBlock: block as number,
    lastBlock: block as number,
    firstTxId: tx,
    lastTxId: tx,
  };
}

async function pageLogs(
  load: (offset: number, limit: number) => Promise<unknown[]>,
): Promise<EventLog[]> {
  const rows: EventLog[] = [];
  for (let offset = 0; offset < MAX_LOGS_PER_ASSET; offset += PAGE_SIZE) {
    const page = await load(offset, PAGE_SIZE);
    rows.push(...page as EventLog[]);
    if (page.length < PAGE_SIZE) return rows;
  }
  // Never silently treat a capped result as a complete chain scan.
  throw new Error('Post-vote funding scan reached its per-asset event limit.');
}

/**
 * Observation-only: NO risk signals, automatic restrictions, reward mutations
 * or clearance changes. Chain events must fall between activation and vote.
 */
export async function readPostVoteFundingObservation({
  walletAddress,
  network,
  activationBlock,
  voteBlock,
  protocolSources,
}: {
  walletAddress: string;
  network: VeBetterNetwork;
  activationBlock: number;
  voteBlock: number;
  protocolSources: Set<string>;
}): Promise<PostVoteFundingObservation> {
  const wallet = walletAddress.trim().toLowerCase();
  if (
    !ADDRESS_PATTERN.test(wallet) ||
    !Number.isSafeInteger(activationBlock) ||
    !Number.isSafeInteger(voteBlock) ||
    activationBlock <= 0 ||
    voteBlock < activationBlock ||
    voteBlock - activationBlock > MAX_BLOCK_SPAN
  ) {
    throw new Error('Post-vote funding observation received invalid scan boundaries.');
  }

  const config = getVeBetterNetworkConfig();
  if (config.network !== network) {
    throw new Error('Post-vote funding observation network mismatch.');
  }

  const thor = ThorClient.at(config.nodeUrl);
  const range = {
    unit: 'block' as const,
    from: activationBlock,
    to: voteBlock,
  };

  const [b3trLogs, vthoLogs] = await Promise.all([
    pageLogs((offset, limit) =>
      thor.logs.filterRawEventLogs({
        criteriaSet: [{
          address: config.b3trAddress,
          topic0: TRANSFER_TOPIC,
          topic2: addressTopic(wallet),
        }],
        range,
        options: { offset, limit },
        order: 'asc',
      }),
    ),
    pageLogs((offset, limit) =>
      thor.logs.filterRawEventLogs({
        criteriaSet: [{
          address: VTHO_ADDRESS,
          topic0: TRANSFER_TOPIC,
          topic2: addressTopic(wallet),
        }],
        range,
        options: { offset, limit },
        order: 'asc',
      }),
    ),
  ]);

  const sources = new Map<string, PostVoteFundingSource>();
  let excludedProtocolTransfers = 0;
  const acceptedCounts = { B3TR: 0, VTHO: 0 };

  const append = (asset: 'B3TR' | 'VTHO', logs: EventLog[]) => {
    for (const event of logs) {
      const transfer = parseTransfer(event, asset, activationBlock, voteBlock);
      if (!transfer) continue;
      if (
        transfer.sender === wallet ||
        protocolSources.has(transfer.sender)
      ) {
        excludedProtocolTransfers += 1;
        continue;
      }

      acceptedCounts[asset] += 1;
      const key = `${asset}:${transfer.sender}`;
      const prior = sources.get(key);
      if (prior) {
        prior.transferCount += 1;
        prior.totalAmountWei =
          (BigInt(prior.totalAmountWei) + transfer.amount).toString();
        if (transfer.firstBlock < prior.firstBlock) {
          prior.firstBlock = transfer.firstBlock;
          prior.firstTxId = transfer.firstTxId;
        }
        if (transfer.lastBlock >= prior.lastBlock) {
          prior.lastBlock = transfer.lastBlock;
          prior.lastTxId = transfer.lastTxId;
        }
      } else {
        sources.set(key, {
          asset,
          sender: transfer.sender,
          transferCount: 1,
          totalAmountWei: transfer.amount.toString(),
          firstBlock: transfer.firstBlock,
          lastBlock: transfer.lastBlock,
          firstTxId: transfer.firstTxId,
          lastTxId: transfer.lastTxId,
        });
      }
    }
  };
  append('B3TR', b3trLogs);
  append('VTHO', vthoLogs);

  const ordered = [...sources.values()].sort((left, right) => {
    const amounts = BigInt(right.totalAmountWei) - BigInt(left.totalAmountWei);
    if (amounts > 0n) return 1;
    if (amounts < 0n) return -1;
    return left.asset.localeCompare(right.asset) ||
      left.sender.localeCompare(right.sender);
  });
  // Cap independently so large B3TR histories cannot hide VTHO funders.
  const selected = [
    ...ordered.filter((row) => row.asset === 'B3TR').slice(0, MAX_SOURCES_PER_ASSET),
    ...ordered.filter((row) => row.asset === 'VTHO').slice(0, MAX_SOURCES_PER_ASSET),
  ];

  return {
    fromBlock: activationBlock,
    throughBlock: voteBlock,
    inboundB3trTransfers: acceptedCounts.B3TR,
    inboundVthoTransfers: acceptedCounts.VTHO,
    excludedProtocolTransfers,
    sourceCount: sources.size,
    sourcesTruncated: selected.length < sources.size,
    sources: selected,
  };
}
