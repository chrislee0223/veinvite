import 'server-only';

import { send } from '@vercel/queue';

import { supabaseAdmin } from '@/lib/supabaseServer';

export const SYBIL_V2_EVIDENCE_TOPIC =
  'veinvite-sybil-v2-evidence';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const MESSAGE_RETENTION_SECONDS = 86_400;
const DEFAULT_BACKLOG_ENQUEUE_BATCH_SIZE = 50;
const MAX_BACKLOG_ENQUEUE_BATCH_SIZE = 100;
const DEFAULT_PAID_BACKFILL_BATCH_SIZE = 4;
const MAX_PAID_BACKFILL_BATCH_SIZE = 10;

export type SybilV2EvidenceMessage = {
  inviteCode: string;
  detectedAt: string;
};

export type SybilV2EvidenceBacklogEnqueueSummary = {
  considered: number;
  enqueued: number;
  failed: number;
  failures: Array<{
    inviteCode: string;
    error: string;
  }>;
};

export type SybilV2PaidBackfillEnqueueSummary =
  SybilV2EvidenceBacklogEnqueueSummary & {
    observationOnly: true;
    historicalRewardsUnaffected: true;
  };

export function isSybilV2EvidenceMessage(
  value: unknown,
): value is SybilV2EvidenceMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.inviteCode === 'string' &&
    INVITE_CODE_PATTERN.test(candidate.inviteCode) &&
    typeof candidate.detectedAt === 'string' &&
    !Number.isNaN(Date.parse(candidate.detectedAt))
  );
}

export async function enqueueSybilV2EvidenceCollection({
  inviteCode,
  detectedAt,
}: SybilV2EvidenceMessage): Promise<{
  messageId: string | null;
}> {
  const payload: SybilV2EvidenceMessage = {
    inviteCode: inviteCode.trim().toUpperCase(),
    detectedAt,
  };

  if (!isSybilV2EvidenceMessage(payload)) {
    throw new Error('Sybil v2 evidence queue received invalid metadata.');
  }

  const { messageId } = await send(
    SYBIL_V2_EVIDENCE_TOPIC,
    payload,
    {
      delaySeconds: 1,
      idempotencyKey:
        `veinvite-sybil-v2-evidence-${payload.inviteCode}`,
      retentionSeconds: MESSAGE_RETENTION_SECONDS,
    },
  );

  return { messageId };
}

function normalizeBacklogBatchSize(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    return DEFAULT_BACKLOG_ENQUEUE_BATCH_SIZE;
  }

  return Math.min(
    value,
    MAX_BACKLOG_ENQUEUE_BATCH_SIZE,
  );
}

function normalizePaidBackfillBatchSize(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    return DEFAULT_PAID_BACKFILL_BATCH_SIZE;
  }

  return Math.min(
    value,
    MAX_PAID_BACKFILL_BATCH_SIZE,
  );
}

/**
 * Lightweight recovery publisher for activated referrals whose v2 chain
 * snapshot is still incomplete. The actual chain scan remains isolated in the
 * queue consumer, so reconciliation does not accumulate many long RPC scans in
 * one serverless invocation.
 *
 * Idempotency is intentionally shared with the activation-time publisher.
 * Re-publishing a still-live message is harmless, while an expired/missed
 * activation message can be recreated from the authoritative DB backlog.
 */
export async function enqueueSybilV2EvidenceBacklogBatch(
  requestedLimit = DEFAULT_BACKLOG_ENQUEUE_BATCH_SIZE,
): Promise<SybilV2EvidenceBacklogEnqueueSummary> {
  const limit = normalizeBacklogBatchSize(requestedLimit);
  const { data, error } = await supabaseAdmin
    .from('operator_sybil_v2_scan_candidates')
    .select('invite_code')
    .order('priority_at', {
      ascending: true,
      nullsFirst: true,
    })
    .limit(limit);

  if (error) {
    throw new Error(
      `Sybil v2 evidence backlog could not be loaded: ${error.message}`,
    );
  }

  const rows = data ?? [];
  const summary: SybilV2EvidenceBacklogEnqueueSummary = {
    considered: rows.length,
    enqueued: 0,
    failed: 0,
    failures: [],
  };
  const detectedAt = new Date().toISOString();

  for (const row of rows) {
    const inviteCode =
      typeof row.invite_code === 'string'
        ? row.invite_code.trim().toUpperCase()
        : '';

    if (!INVITE_CODE_PATTERN.test(inviteCode)) {
      summary.failed += 1;
      summary.failures.push({
        inviteCode: inviteCode || 'UNKNOWN',
        error: 'Invalid invite code in Sybil v2 scan backlog.',
      });
      continue;
    }

    try {
      await enqueueSybilV2EvidenceCollection({
        inviteCode,
        detectedAt,
      });
      summary.enqueued += 1;
    } catch (queueError) {
      summary.failed += 1;
      summary.failures.push({
        inviteCode,
        error:
          queueError instanceof Error
            ? queueError.message.slice(0, 500)
            : 'Unknown Sybil v2 queue error.',
      });
    }
  }

  return summary;
}


/**
 * Slowly backfills raw historical/funding evidence for already-paid referrals.
 *
 * Safety invariants:
 * - uses the same idempotent evidence queue as active referrals;
 * - only candidates from a service-only PAID view are published;
 * - the queue consumer only collects immutable evidence for these rows;
 * - paid referrals are not reward-assessment candidates, so no clearance,
 *   reward mutation, HOLD notification, or past-reward reversal is created.
 *
 * This baseline lets future referrals be compared with known historical
 * clusters (including Round 116-like reward/consolidation patterns) without
 * changing any historical payout.
 */
export async function enqueueSybilV2PaidBackfillBatch(
  requestedLimit = DEFAULT_PAID_BACKFILL_BATCH_SIZE,
): Promise<SybilV2PaidBackfillEnqueueSummary> {
  const limit = normalizePaidBackfillBatchSize(
    requestedLimit,
  );
  const { data, error } = await supabaseAdmin
    .from('operator_sybil_v2_paid_backfill_candidates')
    .select('invite_code')
    .order('priority_at', {
      ascending: true,
      nullsFirst: true,
    })
    .limit(limit);

  if (error) {
    throw new Error(
      `Sybil v2 paid backfill candidates could not be loaded: ${error.message}`,
    );
  }

  const rows = data ?? [];
  const summary: SybilV2PaidBackfillEnqueueSummary = {
    observationOnly: true,
    historicalRewardsUnaffected: true,
    considered: rows.length,
    enqueued: 0,
    failed: 0,
    failures: [],
  };
  const detectedAt = new Date().toISOString();

  for (const row of rows) {
    const inviteCode =
      typeof row.invite_code === 'string'
        ? row.invite_code.trim().toUpperCase()
        : '';

    if (!INVITE_CODE_PATTERN.test(inviteCode)) {
      summary.failed += 1;
      summary.failures.push({
        inviteCode: inviteCode || 'UNKNOWN',
        error:
          'Invalid invite code in Sybil v2 paid backfill.',
      });
      continue;
    }

    try {
      await enqueueSybilV2EvidenceCollection({
        inviteCode,
        detectedAt,
      });
      summary.enqueued += 1;
    } catch (queueError) {
      summary.failed += 1;
      summary.failures.push({
        inviteCode,
        error:
          queueError instanceof Error
            ? queueError.message.slice(0, 500)
            : 'Unknown Sybil v2 paid backfill queue error.',
      });
    }
  }

  return summary;
}
