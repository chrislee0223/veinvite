import 'server-only';

import { id } from 'ethers';

import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TX_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const APP_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const REWARD_DISTRIBUTED_TOPIC = id(
  'RewardDistributed(uint256,bytes32,address,string,address)',
).toLowerCase();
const PAGE_SIZE = 1000;
const MAX_EVENT_LOGS_PER_QUERY = 5000;
const REQUEST_TIMEOUT_MS = 15_000;
const REQUEST_ATTEMPTS = 3;

type ThorEventLog = {
  data?: string;
  topics?: string[];
  meta?: {
    blockNumber?: number;
    blockTimestamp?: number | string;
    txID?: string;
  };
};

export type HistoricalRewardEventV2 = {
  appId: string;
  blockNumber: number;
  blockTimestamp: string | null;
  txId: string;
  amountWei: string;
};

export type HistoricalB3trOutflowV2 = {
  destination: string;
  blockNumber: number;
  blockTimestamp: string | null;
  txId: string;
  amountWei: string;
};

export type HistoricalWalletChainSnapshotV2 = {
  walletAddress: string;
  activationBlock: number;
  rewardEvents: HistoricalRewardEventV2[];
  b3trOutflows: HistoricalB3trOutflowV2[];
  checkedAt: string;
};

function normalizeAddress(value: string): string {
  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error('Historical Sybil analysis received an invalid wallet address.');
  }
  return value.toLowerCase();
}

function addressTopic(address: string): string {
  return `0x${'0'.repeat(24)}${normalizeAddress(address).slice(2)}`;
}

function parseAmountWei(data: string | undefined): string {
  const normalized = data?.toLowerCase().replace(/^0x/, '') ?? '';
  if (normalized.length < 64 || !/^[0-9a-f]+$/u.test(normalized)) {
    throw new Error('Historical B3TR event is missing a valid amount.');
  }
  return BigInt(`0x${normalized.slice(0, 64)}`).toString();
}

function topicAddress(value: string | undefined): string | null {
  if (!value || !APP_ID_PATTERN.test(value)) return null;
  const address = `0x${value.slice(-40)}`.toLowerCase();
  return ADDRESS_PATTERN.test(address) ? address : null;
}

function timestampIso(value: number | string | undefined): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return timestampIso(asNumber);
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

async function postThor<T>({
  nodeUrl,
  path,
  body,
}: {
  nodeUrl: string;
  path: string;
  body: unknown;
}): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${nodeUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `VeChain node returned HTTP ${response.status} for ${path}.`,
        );
      }

      return await response.json() as T;
    } catch (error) {
      lastError = error;
      if (attempt < REQUEST_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 200));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    `VeChain historical query failed after retries: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function readPagedEventLogs({
  nodeUrl,
  criteriaSet,
  fromBlock,
  toBlock,
}: {
  nodeUrl: string;
  criteriaSet: Array<Record<string, string>>;
  fromBlock: number;
  toBlock: number;
}): Promise<ThorEventLog[]> {
  if (toBlock < fromBlock) return [];

  const rows: ThorEventLog[] = [];
  let offset = 0;

  while (true) {
    const page = await postThor<ThorEventLog[]>({
      nodeUrl,
      path: '/logs/event',
      body: {
        criteriaSet,
        range: {
          unit: 'block',
          from: fromBlock,
          to: toBlock,
        },
        options: {
          offset,
          limit: PAGE_SIZE,
        },
        order: 'asc',
      },
    });

    rows.push(...page);

    if (rows.length > MAX_EVENT_LOGS_PER_QUERY) {
      throw new Error(
        'Historical Sybil query exceeded the safe event cap and must be reviewed instead of silently truncating evidence.',
      );
    }

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

function validMeta(log: ThorEventLog): {
  blockNumber: number;
  txId: string;
  blockTimestamp: string | null;
} {
  const blockNumber = log.meta?.blockNumber;
  const txId = log.meta?.txID?.toLowerCase() ?? '';

  if (
    !Number.isSafeInteger(blockNumber) ||
    (blockNumber as number) < 0 ||
    !TX_ID_PATTERN.test(txId)
  ) {
    throw new Error('Historical chain event is missing valid block/transaction metadata.');
  }

  return {
    blockNumber: blockNumber as number,
    txId,
    blockTimestamp: timestampIso(log.meta?.blockTimestamp),
  };
}

export async function readHistoricalWalletChainSnapshotV2({
  walletAddress,
  activationBlock,
}: {
  walletAddress: string;
  activationBlock: number;
}): Promise<HistoricalWalletChainSnapshotV2> {
  const wallet = normalizeAddress(walletAddress);

  if (!Number.isSafeInteger(activationBlock) || activationBlock <= 0) {
    throw new Error('Historical Sybil analysis requires a positive activation block.');
  }

  const config = getVeBetterNetworkConfig();
  const beforeActivation = activationBlock - 1;
  const pool = normalizeAddress(config.x2EarnRewardsPoolAddress);
  const b3tr = normalizeAddress(config.b3trAddress);

  const [rewardTransfers, outboundTransfers] = await Promise.all([
    readPagedEventLogs({
      nodeUrl: config.nodeUrl,
      criteriaSet: [{
        address: b3tr,
        topic0: TRANSFER_TOPIC,
        topic1: addressTopic(pool),
        topic2: addressTopic(wallet),
      }],
      fromBlock: 0,
      toBlock: beforeActivation,
    }),
    readPagedEventLogs({
      nodeUrl: config.nodeUrl,
      criteriaSet: [{
        address: b3tr,
        topic0: TRANSFER_TOPIC,
        topic1: addressTopic(wallet),
      }],
      fromBlock: 0,
      toBlock: beforeActivation,
    }),
  ]);

  const rewardTransfersByBlock = new Map<
    number,
    Array<{ txId: string; amountWei: string; blockTimestamp: string | null }>
  >();

  for (const log of rewardTransfers) {
    const meta = validMeta(log);
    const amountWei = parseAmountWei(log.data);
    const bucket = rewardTransfersByBlock.get(meta.blockNumber) ?? [];
    bucket.push({
      txId: meta.txId,
      amountWei,
      blockTimestamp: meta.blockTimestamp,
    });
    rewardTransfersByBlock.set(meta.blockNumber, bucket);
  }

  const rewardEvents: HistoricalRewardEventV2[] = [];
  const rewardDedupe = new Set<string>();

  for (const [blockNumber, transfers] of rewardTransfersByBlock) {
    const poolEvents = await readPagedEventLogs({
      nodeUrl: config.nodeUrl,
      criteriaSet: [{
        address: pool,
        topic0: REWARD_DISTRIBUTED_TOPIC,
        topic2: addressTopic(wallet),
      }],
      fromBlock: blockNumber,
      toBlock: blockNumber,
    });

    const transferByTx = new Map(
      transfers.map((transfer) => [transfer.txId, transfer]),
    );

    for (const event of poolEvents) {
      const meta = validMeta(event);
      const transfer = transferByTx.get(meta.txId);
      const appId = event.topics?.[1]?.toLowerCase() ?? '';

      if (!transfer || !APP_ID_PATTERN.test(appId)) continue;

      const key = `${meta.txId}:${appId}`;
      if (rewardDedupe.has(key)) continue;
      rewardDedupe.add(key);

      rewardEvents.push({
        appId,
        blockNumber,
        blockTimestamp: meta.blockTimestamp ?? transfer.blockTimestamp,
        txId: meta.txId,
        amountWei: transfer.amountWei,
      });
    }
  }

  rewardEvents.sort((left, right) =>
    left.blockNumber - right.blockNumber ||
    left.txId.localeCompare(right.txId) ||
    left.appId.localeCompare(right.appId),
  );

  const b3trOutflows: HistoricalB3trOutflowV2[] = [];

  for (const log of outboundTransfers) {
    const meta = validMeta(log);
    const destination = topicAddress(log.topics?.[2]);
    if (!destination || destination === wallet) continue;

    const amountWei = parseAmountWei(log.data);
    if (BigInt(amountWei) <= 0n) continue;

    b3trOutflows.push({
      destination,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      txId: meta.txId,
      amountWei,
    });
  }

  b3trOutflows.sort((left, right) =>
    left.blockNumber - right.blockNumber ||
    left.txId.localeCompare(right.txId),
  );

  return {
    walletAddress: wallet,
    activationBlock,
    rewardEvents,
    b3trOutflows,
    checkedAt: new Date().toISOString(),
  };
}
