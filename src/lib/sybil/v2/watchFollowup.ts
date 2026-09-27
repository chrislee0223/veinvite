import 'server-only';

import { ThorClient } from '@vechain/sdk-network';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PAGE_SIZE = 1000;
const SCAN_CHUNK_BLOCKS = 50_000;
const MAX_SCAN_BLOCK_SPAN = 400_000;
const MAX_EVENT_LOGS_PER_SCAN = 5_000;
const MAX_BATCH_SIZE = 4;
const LOOKUP_CHUNK_SIZE = 100;

type WatchFollowupDueRow = {
  invite_code: string;
  network: VeBetterNetwork;
  inviter_wallet: string;
  subject_wallet: string;
  watch_started_at: string;
  horizon_hours: number | string;
  due_at: string;
  scan_from_block: number | string;
};

type RawTransferLog = {
  data?: string;
  topics?: string[];
  meta?: {
    blockNumber?: number;
    blockTimestamp?: number | string;
    txID?: string;
  };
};

type WatchOutflow = {
  inviteCode: string;
  network: VeBetterNetwork;
  subjectWallet: string;
  destinationWallet: string;
  blockNumber: number;
  blockTimestamp: string | null;
  txId: string;
  amountWei: string;
  horizonHours: number;
};

type HubCandidateRow = {
  wallet_address: string;
  priority: 'WATCH' | 'HIGH' | 'PRIORITY';
  sender_count: number | string;
  active_blacklisted_sender_count: number | string;
  watched_sender_count: number | string;
};

type ActiveRestrictionRow = {
  wallet_address: string;
};

type WatchIndicator = {
  code:
    | 'WATCH_SUBJECT_TO_INVITER'
    | 'WATCH_SUBJECT_TO_ACTIVE_BLACKLIST'
    | 'WATCH_SUBJECT_TO_CLUSTER_HUB';
  level: 'MEDIUM' | 'HIGH';
  destination: string;
  details: Record<string, unknown>;
};

function normalizeWallet(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/u.test(normalized)) {
    throw new Error('WATCH follow-up received an invalid wallet address.');
  }
  return normalized;
}

function safeNonNegativeInteger(
  value: number | string,
  label: string,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : /^\d+$/u.test(value)
        ? Number(value)
        : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`WATCH follow-up received invalid ${label}.`);
  }

  return parsed;
}

function topicAddress(value: string | undefined): string | null {
  if (!value || !/^0x[0-9a-fA-F]{64}$/u.test(value)) return null;
  const address = `0x${value.slice(-40)}`.toLowerCase();
  return /^0x[0-9a-f]{40}$/u.test(address) ? address : null;
}

function addressTopic(address: string): string {
  return `0x${'0'.repeat(24)}${normalizeWallet(address).slice(2)}`;
}

function parseAmountWei(data: string | undefined): string {
  const normalized = data?.toLowerCase().replace(/^0x/u, '') ?? '';
  if (normalized.length < 64 || !/^[0-9a-f]+$/u.test(normalized)) {
    throw new Error('WATCH follow-up B3TR transfer is missing a valid amount.');
  }

  const amount = BigInt(`0x${normalized.slice(0, 64)}`);
  if (amount <= 0n) {
    throw new Error('WATCH follow-up B3TR transfer has a non-positive amount.');
  }

  return amount.toString();
}

function timestampIso(value: number | string | undefined): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const parsed = new Date(milliseconds);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return timestampIso(numeric);

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }

  return null;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function readFinalizedBlockNumber(): Promise<number> {
  const { nodeUrl } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const block = await thor.blocks.getBlockCompressed('finalized');
  const number = Number(block?.number);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error('WATCH follow-up could not load a finalized VeChain block.');
  }

  return number;
}

async function scanSubjectB3trOutflows({
  due,
  scanToBlock,
}: {
  due: WatchFollowupDueRow;
  scanToBlock: number;
}): Promise<WatchOutflow[]> {
  const config = getVeBetterNetworkConfig();
  const subjectWallet = normalizeWallet(due.subject_wallet);
  const scanFromBlock = safeNonNegativeInteger(
    due.scan_from_block,
    'scan_from_block',
  );
  const horizonHours = safeNonNegativeInteger(
    due.horizon_hours,
    'horizon_hours',
  );

  if (due.network !== config.network) {
    throw new Error('WATCH follow-up network does not match the active deployment.');
  }

  if (scanToBlock < scanFromBlock) return [];

  const span = scanToBlock - scanFromBlock + 1;
  if (span > MAX_SCAN_BLOCK_SPAN) {
    throw new Error('WATCH follow-up scan range exceeded the reviewed safety cap.');
  }

  const thor = ThorClient.at(config.nodeUrl);
  const outflows: WatchOutflow[] = [];
  const dedupe = new Set<string>();

  for (
    let chunkFrom = scanFromBlock;
    chunkFrom <= scanToBlock;
    chunkFrom += SCAN_CHUNK_BLOCKS
  ) {
    const chunkTo = Math.min(
      scanToBlock,
      chunkFrom + SCAN_CHUNK_BLOCKS - 1,
    );
    let offset = 0;

    while (true) {
      const rawLogs = await thor.logs.filterRawEventLogs({
        range: {
          unit: 'block',
          from: chunkFrom,
          to: chunkTo,
        },
        options: {
          offset,
          limit: PAGE_SIZE,
        },
        criteriaSet: [
          {
            address: config.b3trAddress,
            topic0: TRANSFER_TOPIC,
            topic1: addressTopic(subjectWallet),
          },
        ],
        order: 'asc',
      }) as RawTransferLog[];

      for (const log of rawLogs) {
        const destination = topicAddress(log.topics?.[2]);
        const blockNumber = Number(log.meta?.blockNumber);
        const txId = log.meta?.txID?.toLowerCase() ?? '';

        if (
          !destination ||
          destination === subjectWallet ||
          !Number.isSafeInteger(blockNumber) ||
          blockNumber < 0 ||
          !/^0x[0-9a-f]{64}$/u.test(txId)
        ) {
          continue;
        }

        const amountWei = parseAmountWei(log.data);
        const key = `${txId}:${destination}:${amountWei}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);

        outflows.push({
          inviteCode: due.invite_code,
          network: due.network,
          subjectWallet,
          destinationWallet: destination,
          blockNumber,
          blockTimestamp:
            timestampIso(log.meta?.blockTimestamp),
          txId,
          amountWei,
          horizonHours,
        });

        if (outflows.length > MAX_EVENT_LOGS_PER_SCAN) {
          throw new Error(
            'WATCH follow-up exceeded the safe B3TR transfer cap and requires operator review.',
          );
        }
      }

      if (rawLogs.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return outflows;
}

async function persistOutflows(
  outflows: WatchOutflow[],
) {
  if (outflows.length === 0) return;

  const { error } = await supabaseAdmin
    .from('sybil_v2_watch_followup_outflows')
    .upsert(
      outflows.map((outflow) => ({
        invite_code: outflow.inviteCode,
        network: outflow.network,
        subject_wallet: outflow.subjectWallet,
        destination_wallet:
          outflow.destinationWallet,
        block_number: outflow.blockNumber,
        block_timestamp:
          outflow.blockTimestamp,
        tx_id: outflow.txId,
        amount_wei: outflow.amountWei,
        first_observed_horizon_hours:
          outflow.horizonHours,
      })),
      {
        onConflict:
          'invite_code,tx_id,destination_wallet,amount_wei',
        ignoreDuplicates: true,
      },
    );

  if (error && error.code !== '23505') {
    throw new Error(
      `WATCH follow-up outflows could not be stored: ${error.message}`,
    );
  }
}

async function loadHubCandidates(
  network: VeBetterNetwork,
  destinations: string[],
): Promise<Map<string, HubCandidateRow>> {
  const result = new Map<string, HubCandidateRow>();

  for (const batch of chunks(destinations, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from('operator_sybil_v2_cluster_hub_candidates')
      .select(
        'wallet_address,priority,sender_count,active_blacklisted_sender_count,watched_sender_count',
      )
      .eq('network', network)
      .in('wallet_address', batch);

    if (error) {
      throw new Error(
        `WATCH follow-up hub candidates could not be loaded: ${error.message}`,
      );
    }

    for (const row of (data ?? []) as HubCandidateRow[]) {
      result.set(
        normalizeWallet(row.wallet_address),
        row,
      );
    }
  }

  return result;
}

async function loadActiveRestrictedDestinations(
  network: VeBetterNetwork,
  destinations: string[],
): Promise<Set<string>> {
  const result = new Set<string>();

  for (const batch of chunks(destinations, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from('sybil_v2_wallet_restrictions')
      .select('wallet_address')
      .eq('network', network)
      .eq('status', 'ACTIVE')
      .in('wallet_address', batch);

    if (error) {
      throw new Error(
        `WATCH follow-up active restrictions could not be loaded: ${error.message}`,
      );
    }

    for (const row of (data ?? []) as ActiveRestrictionRow[]) {
      result.add(normalizeWallet(row.wallet_address));
    }
  }

  return result;
}

function buildIndicators({
  due,
  destinations,
  hubs,
  activeRestricted,
}: {
  due: WatchFollowupDueRow;
  destinations: string[];
  hubs: Map<string, HubCandidateRow>;
  activeRestricted: Set<string>;
}): WatchIndicator[] {
  const inviter = normalizeWallet(due.inviter_wallet);
  const indicators: WatchIndicator[] = [];

  for (const destination of destinations) {
    if (destination === inviter) {
      indicators.push({
        code: 'WATCH_SUBJECT_TO_INVITER',
        level: 'MEDIUM',
        destination,
        details: {
          relationship: 'INVITER',
          automaticRestriction: false,
        },
      });
    }

    if (activeRestricted.has(destination)) {
      indicators.push({
        code: 'WATCH_SUBJECT_TO_ACTIVE_BLACKLIST',
        level: 'HIGH',
        destination,
        details: {
          relationship: 'ACTIVE_RESTRICTION_DESTINATION',
          automaticRestriction: false,
        },
      });
    }

    const hub = hubs.get(destination);
    if (hub) {
      indicators.push({
        code: 'WATCH_SUBJECT_TO_CLUSTER_HUB',
        level:
          hub.priority === 'PRIORITY'
            ? 'HIGH'
            : 'MEDIUM',
        destination,
        details: {
          hubPriority: hub.priority,
          senderCount:
            Number(hub.sender_count),
          activeBlacklistedSenderCount:
            Number(
              hub.active_blacklisted_sender_count,
            ),
          watchedSenderCount:
            Number(hub.watched_sender_count),
          automaticRestriction: false,
        },
      });
    }
  }

  return indicators;
}

async function persistObservation({
  due,
  scanToBlock,
  outflows,
  indicators,
}: {
  due: WatchFollowupDueRow;
  scanToBlock: number;
  outflows: WatchOutflow[];
  indicators: WatchIndicator[];
}) {
  const destinations = unique(
    indicators.map((indicator) =>
      indicator.destination,
    ),
  );

  const { error } = await supabaseAdmin
    .from('sybil_v2_watch_followup_observations')
    .insert({
      invite_code: due.invite_code,
      network: due.network,
      subject_wallet:
        normalizeWallet(due.subject_wallet),
      horizon_hours:
        safeNonNegativeInteger(
          due.horizon_hours,
          'horizon_hours',
        ),
      scan_from_block:
        safeNonNegativeInteger(
          due.scan_from_block,
          'scan_from_block',
        ),
      scan_to_block: scanToBlock,
      outgoing_transfer_count:
        outflows.length,
      suspicious_destination_count:
        destinations.length,
      indicators,
      checked_at:
        new Date().toISOString(),
    });

  if (error && error.code !== '23505') {
    throw new Error(
      `WATCH follow-up observation could not be stored: ${error.message}`,
    );
  }
}

async function runWatchFollowup({
  due,
  finalizedBlock,
}: {
  due: WatchFollowupDueRow;
  finalizedBlock: number;
}): Promise<'completed' | 'flagged' | 'waiting'> {
  const scanFromBlock = safeNonNegativeInteger(
    due.scan_from_block,
    'scan_from_block',
  );

  if (scanFromBlock > finalizedBlock) {
    return 'waiting';
  }

  const outflows =
    await scanSubjectB3trOutflows({
      due,
      scanToBlock: finalizedBlock,
    });

  await persistOutflows(outflows);

  const destinations = unique(
    outflows.map((outflow) =>
      outflow.destinationWallet,
    ),
  );

  const [hubs, activeRestricted] =
    destinations.length > 0
      ? await Promise.all([
          loadHubCandidates(
            due.network,
            destinations,
          ),
          loadActiveRestrictedDestinations(
            due.network,
            destinations,
          ),
        ])
      : [
          new Map<string, HubCandidateRow>(),
          new Set<string>(),
        ];

  const indicators = buildIndicators({
    due,
    destinations,
    hubs,
    activeRestricted,
  });

  await persistObservation({
    due,
    scanToBlock: finalizedBlock,
    outflows,
    indicators,
  });

  return indicators.length > 0
    ? 'flagged'
    : 'completed';
}

export async function runSybilV2WatchFollowupBatch(
  limit = 2,
): Promise<{
  attempted: number;
  completed: number;
  flagged: number;
  waiting: number;
  failed: number;
}> {
  const config = getVeBetterNetworkConfig();
  const bounded = Math.max(
    1,
    Math.min(
      MAX_BATCH_SIZE,
      Math.trunc(limit),
    ),
  );

  const { data, error } = await supabaseAdmin
    .from('operator_sybil_v2_watch_followup_due')
    .select(
      'invite_code,network,inviter_wallet,subject_wallet,watch_started_at,horizon_hours,due_at,scan_from_block',
    )
    .eq('network', config.network)
    .order('due_at', {
      ascending: true,
    })
    .limit(bounded);

  if (error) {
    throw new Error(
      `WATCH follow-up candidates could not be loaded: ${error.message}`,
    );
  }

  const rows =
    (data ?? []) as WatchFollowupDueRow[];

  if (rows.length === 0) {
    return {
      attempted: 0,
      completed: 0,
      flagged: 0,
      waiting: 0,
      failed: 0,
    };
  }

  const finalizedBlock =
    await readFinalizedBlockNumber();

  let completed = 0;
  let flagged = 0;
  let waiting = 0;
  let failed = 0;

  for (const due of rows) {
    try {
      const result =
        await runWatchFollowup({
          due,
          finalizedBlock,
        });

      if (result === 'flagged') {
        flagged += 1;
      } else if (result === 'waiting') {
        waiting += 1;
      } else {
        completed += 1;
      }
    } catch (watchError) {
      failed += 1;
      console.error(
        'Sybil v2 WATCH follow-up failed:',
        {
          inviteCode: due.invite_code,
          horizonHours:
            due.horizon_hours,
          error: watchError,
        },
      );
    }
  }

  return {
    attempted: rows.length,
    completed,
    flagged,
    waiting,
    failed,
  };
}
