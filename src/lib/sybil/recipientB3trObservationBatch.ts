import 'server-only';

import { randomUUID } from 'node:crypto';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  observeRecipientB3trReceipt,
} from '@/lib/sybil/recipientB3trObservation';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

export const DEFAULT_B3TR_RECIPIENT_OBSERVATION_BATCH_SIZE = 3;
const MAX_B3TR_RECIPIENT_OBSERVATION_BATCH_SIZE = 10;
const OBSERVATION_LEASE_SECONDS = 600;

type DueObservationRow = {
  receipt_id: number | string;
  network: string;
  paid_at: string;
  target_scan_to_block: number | string;
};

export type B3trRecipientObservationFailure = {
  receiptId: number | null;
  error: string;
};

export type B3trRecipientObservationBatchSummary = {
  enabled: boolean;
  network: string;
  observationOnly: true;
  transfersPerformed: false;
  sybilStatusChanged: false;
  rewardStatusChanged: false;
  skippedBecauseLocked: boolean;
  considered: number;
  observed: number;
  inserted: number;
  skippedExisting: number;
  horizonPending: number;
  failures: B3trRecipientObservationFailure[];
};

function observationEnabled() {
  return process.env.SYBIL_B3TR_OBSERVATION_ENABLED === 'true';
}

function normalizeBatchSize(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    return DEFAULT_B3TR_RECIPIENT_OBSERVATION_BATCH_SIZE;
  }

  return Math.min(
    value,
    MAX_B3TR_RECIPIENT_OBSERVATION_BATCH_SIZE,
  );
}

function parsePositiveInteger(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^[1-9]\d*$/.test(value)
        ? Number(value)
        : null;

  return parsed !== null &&
    Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

function parseNonNegativeInteger(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : null;

  return parsed !== null &&
    Number.isSafeInteger(parsed) &&
    parsed >= 0
    ? parsed
    : null;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : 'Unknown B3TR recipient observation error.';
}

async function acquireLock(
  lockName: string,
  ownerToken: string,
) {
  const { data, error } = await supabaseAdmin.rpc(
    'try_acquire_operator_lock',
    {
      p_lock_name: lockName,
      p_owner_token: ownerToken,
      p_lease_seconds: OBSERVATION_LEASE_SECONDS,
    },
  );

  if (error) {
    throw new Error(
      `Failed to acquire B3TR recipient observation lock: ${error.message}`,
    );
  }

  return data === true;
}

async function releaseLock(
  lockName: string,
  ownerToken: string,
) {
  const { error } = await supabaseAdmin.rpc(
    'release_operator_lock',
    {
      p_lock_name: lockName,
      p_owner_token: ownerToken,
    },
  );

  if (error) {
    console.error(
      'Failed to release B3TR recipient observation lock:',
      error,
    );
  }
}

export async function runB3trRecipientObservationBatch(
  requestedBatchSize =
    DEFAULT_B3TR_RECIPIENT_OBSERVATION_BATCH_SIZE,
): Promise<B3trRecipientObservationBatchSummary> {
  const { network } = getVeBetterNetworkConfig();
  const summary: B3trRecipientObservationBatchSummary = {
    enabled: observationEnabled(),
    network,
    observationOnly: true,
    transfersPerformed: false,
    sybilStatusChanged: false,
    rewardStatusChanged: false,
    skippedBecauseLocked: false,
    considered: 0,
    observed: 0,
    inserted: 0,
    skippedExisting: 0,
    horizonPending: 0,
    failures: [],
  };

  if (!summary.enabled) {
    return summary;
  }

  const batchSize = normalizeBatchSize(requestedBatchSize);
  const lockName = `b3tr_recipient_observation:${network}`;
  const ownerToken = randomUUID();
  const acquired = await acquireLock(lockName, ownerToken);

  if (!acquired) {
    summary.skippedBecauseLocked = true;
    return summary;
  }

  try {
    const dueResult = await supabaseAdmin
      .from('operator_reward_recipient_b3tr_observation_due')
      .select(
        'receipt_id, network, paid_at, target_scan_to_block',
      )
      .eq('network', network)
      .order('paid_at', { ascending: true })
      .limit(batchSize);

    if (dueResult.error) {
      throw new Error(
        `Could not load due B3TR recipient observations: ${dueResult.error.message}`,
      );
    }

    const rows =
      (dueResult.data ?? []) as DueObservationRow[];
    summary.considered = rows.length;

    for (const row of rows) {
      const receiptId = parsePositiveInteger(row.receipt_id);
      const targetScanToBlock = parseNonNegativeInteger(
        row.target_scan_to_block,
      );

      if (!receiptId || targetScanToBlock === null) {
        summary.failures.push({
          receiptId,
          error:
            'Due B3TR observation row has an invalid receipt or target block.',
        });
        continue;
      }

      try {
        const result = await observeRecipientB3trReceipt({
          receiptId,
          expectedNetwork: network,
          minimumScanToBlock: targetScanToBlock,
        });
        summary.observed += 1;

        if (!result.horizonReached) {
          summary.horizonPending += 1;
          continue;
        }

        if (result.inserted) {
          summary.inserted += 1;
        } else if (result.alreadyRecorded) {
          summary.skippedExisting += 1;
        }
      } catch (error) {
        summary.failures.push({
          receiptId,
          error: safeErrorMessage(error),
        });
      }
    }

    return summary;
  } finally {
    await releaseLock(lockName, ownerToken);
  }
}
