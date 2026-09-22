import 'server-only';

import { ThorClient } from '@vechain/sdk-network';

import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TX_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const VTHO_ADDRESS =
  '0x0000000000000000000000000000456e65726779';
const APPROX_BLOCK_SECONDS = 10;
const SEVEN_DAY_BLOCKS = Math.floor(
  (7 * 24 * 60 * 60) / APPROX_BLOCK_SECONDS,
);
const PAGE_SIZE = 250;
const MAX_LOGS_PER_ASSET = 1000;

export type RecentFundingAsset =
  | 'VET'
  | 'VTHO'
  | 'B3TR';

export type RecentPreActivationFunding = {
  asset: RecentFundingAsset;
  sender: string;
  blockNumber: number;
  txId: string | null;
  amountWei: string | null;
  blocksBeforeActivation: number;
};

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | null {
  return typeof value === 'object' && value !== null
    ? value as RawRecord
    : null;
}

function normalizeAddress(value: string): string {
  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error(
      'Recent funding analysis received an invalid wallet address.',
    );
  }
  return value.toLowerCase();
}

function normalizeMaybeAddress(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !ADDRESS_PATTERN.test(value)
  ) {
    return null;
  }
  return value.toLowerCase();
}

function addressTopic(address: string): string {
  return `0x${'0'.repeat(24)}${normalizeAddress(address).slice(2)}`;
}

function addressFromTopic(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !/^0x[0-9a-fA-F]{64}$/u.test(value)
  ) {
    return null;
  }

  const address = `0x${value.slice(-40)}`.toLowerCase();
  return ADDRESS_PATTERN.test(address) ? address : null;
}

function blockNumberOf(value: unknown): number | null {
  const record = asRecord(value);
  const meta = record ? asRecord(record.meta) : null;
  const raw =
    record?.blockNumber ??
    record?.block_number ??
    meta?.blockNumber ??
    meta?.block_number;
  const parsed =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/u.test(raw)
        ? Number(raw)
        : Number.NaN;

  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : null;
}

function txIdOf(value: unknown): string | null {
  const record = asRecord(value);
  const meta = record ? asRecord(record.meta) : null;
  const raw =
    record?.txID ??
    record?.txId ??
    meta?.txID ??
    meta?.txId;

  if (
    typeof raw !== 'string' ||
    !TX_ID_PATTERN.test(raw)
  ) {
    return null;
  }

  return raw.toLowerCase();
}

function amountFromData(value: unknown): string | null {
  const record = asRecord(value);
  const raw = typeof record?.data === 'string'
    ? record.data.replace(/^0x/u, '')
    : '';

  if (raw.length < 64 || !/^[0-9a-fA-F]+$/u.test(raw)) {
    return null;
  }

  return BigInt(`0x${raw.slice(0, 64)}`).toString();
}

function knownProtocolSources(): Set<string> {
  const config = getVeBetterNetworkConfig();
  return new Set([
    '0x0000000000000000000000000000000000000000',
    config.b3trAddress.toLowerCase(),
    config.vot3Address.toLowerCase(),
    config.x2EarnAppsAddress.toLowerCase(),
    config.x2EarnRewardsPoolAddress.toLowerCase(),
    config.xAllocationVotingAddress.toLowerCase(),
  ]);
}

async function readPaged<T>(
  loader: (offset: number, limit: number) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (rows.length < MAX_LOGS_PER_ASSET) {
    const page = await loader(offset, PAGE_SIZE);
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (rows.length >= MAX_LOGS_PER_ASSET) {
    throw new Error(
      'Recent funding analysis exceeded the safe per-asset event cap.',
    );
  }

  return rows;
}

export async function readRecentPreActivationFundingV2({
  walletAddress,
  activationBlock,
}: {
  walletAddress: string;
  activationBlock: number;
}): Promise<RecentPreActivationFunding[]> {
  const wallet = normalizeAddress(walletAddress);

  if (
    !Number.isSafeInteger(activationBlock) ||
    activationBlock <= 0
  ) {
    throw new Error(
      'Recent funding analysis requires a positive activation block.',
    );
  }

  const config = getVeBetterNetworkConfig();
  const thor = ThorClient.at(config.nodeUrl);
  const fromBlock = Math.max(
    0,
    activationBlock - SEVEN_DAY_BLOCKS,
  );
  const toBlock = activationBlock - 1;

  if (toBlock < fromBlock) return [];

  const range = {
    unit: 'block' as const,
    from: fromBlock,
    to: toBlock,
  };
  const walletTopic = addressTopic(wallet);

  const [vetLogs, vthoLogs, b3trLogs] =
    await Promise.all([
      readPaged((offset, limit) =>
        thor.logs.filterTransferLogs({
          criteriaSet: [{ recipient: wallet }],
          range,
          options: { offset, limit },
          order: 'desc',
        }),
      ),
      readPaged((offset, limit) =>
        thor.logs.filterRawEventLogs({
          criteriaSet: [{
            address: VTHO_ADDRESS,
            topic0: TRANSFER_TOPIC,
            topic2: walletTopic,
          }],
          range,
          options: { offset, limit },
          order: 'desc',
        }),
      ),
      readPaged((offset, limit) =>
        thor.logs.filterRawEventLogs({
          criteriaSet: [{
            address: config.b3trAddress,
            topic0: TRANSFER_TOPIC,
            topic2: walletTopic,
          }],
          range,
          options: { offset, limit },
          order: 'desc',
        }),
      ),
    ]);

  const protocols = knownProtocolSources();
  const rows: RecentPreActivationFunding[] = [];

  for (const log of vetLogs) {
    const record = asRecord(log);
    const sender = normalizeMaybeAddress(
      record?.sender ?? record?.from,
    );
    const blockNumber = blockNumberOf(log);

    if (
      !sender ||
      sender === wallet ||
      protocols.has(sender) ||
      blockNumber === null ||
      blockNumber >= activationBlock
    ) {
      continue;
    }

    rows.push({
      asset: 'VET',
      sender,
      blockNumber,
      txId: txIdOf(log),
      amountWei: null,
      blocksBeforeActivation:
        activationBlock - blockNumber,
    });
  }

  const parseTokenLogs = (
    logs: unknown[],
    asset: 'VTHO' | 'B3TR',
  ) => {
    for (const log of logs) {
      const record = asRecord(log);
      const topics = Array.isArray(record?.topics)
        ? record.topics
        : [];
      const sender = addressFromTopic(topics[1]);
      const blockNumber = blockNumberOf(log);

      if (
        !sender ||
        sender === wallet ||
        protocols.has(sender) ||
        blockNumber === null ||
        blockNumber >= activationBlock
      ) {
        continue;
      }

      rows.push({
        asset,
        sender,
        blockNumber,
        txId: txIdOf(log),
        amountWei: amountFromData(log),
        blocksBeforeActivation:
          activationBlock - blockNumber,
      });
    }
  };

  parseTokenLogs(vthoLogs as unknown[], 'VTHO');
  parseTokenLogs(b3trLogs as unknown[], 'B3TR');

  rows.sort((left, right) =>
    left.blocksBeforeActivation -
      right.blocksBeforeActivation ||
    left.asset.localeCompare(right.asset) ||
    left.sender.localeCompare(right.sender),
  );

  return rows;
}
