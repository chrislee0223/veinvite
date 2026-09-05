import { supabaseAdmin } from '@/lib/supabaseServer';

const CHALLENGE_RETENTION_MS = 60 * 60 * 1000;
const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

export type EphemeralCleanupSummary = {
  expiredChallengesDeleted: number;
  staleSessionsDeleted: number;
  oldRateLimitBucketsDeleted: number;
  expiredRuntimeLocksDeleted: number;
  productAnalyticsCompactedDays: number;
  productAnalyticsEventsDeleted: number;
  analyticsCompactedDays: number;
  analyticsSessionsDeleted: number;
  analyticsVisitorsDeleted: number;
};

function countDeleted(value: number | null) {
  return typeof value === 'number' && value > 0 ? value : 0;
}

function readNumericResult(value: unknown): number {
  const parsed = Number(
    Array.isArray(value) ? value[0] : value,
  );
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : 0;
}

/**
 * Removes only short-lived security/runtime state that is no longer usable.
 *
 * This intentionally never touches invitations, impact proofs, Sybil audit
 * events, reward/accounting records, monitoring snapshots, payout data, or
 * anonymous analytics. Expired operator leases are retained for one extra hour
 * before deletion so cleanup cannot race a lease that has only just crossed
 * its expiry boundary.
 *
 * Anonymous analytics maintenance is intentionally isolated from reconcile.
 * Daily rollups run through the non-destructive analytics-maintenance cron, and
 * any future archive cleanup must verify the durable archive before invoking a
 * destructive compaction RPC. Archive/storage failures therefore cannot block
 * reward reconciliation or other critical housekeeping.
 */
export async function cleanupEphemeralSecurityState(): Promise<EphemeralCleanupSummary> {
  const now = Date.now();
  const challengeCutoff = new Date(
    now - CHALLENGE_RETENTION_MS,
  ).toISOString();
  const sessionCutoff = new Date(
    now - SESSION_RETENTION_MS,
  ).toISOString();
  const rateLimitCutoff = new Date(
    now - RATE_LIMIT_RETENTION_MS,
  ).toISOString();

  const challengeDelete = await supabaseAdmin
    .from('wallet_auth_challenges')
    .delete({ count: 'exact' })
    .lt('expires_at', challengeCutoff);

  if (challengeDelete.error) {
    throw new Error(
      `Expired wallet challenges could not be cleaned: ${challengeDelete.error.message}`,
    );
  }

  const sessionDelete = await supabaseAdmin
    .from('wallet_auth_sessions')
    .delete({ count: 'exact' })
    .or(
      `expires_at.lt.${sessionCutoff},revoked_at.lt.${sessionCutoff}`,
    );

  if (sessionDelete.error) {
    throw new Error(
      `Expired wallet sessions could not be cleaned: ${sessionDelete.error.message}`,
    );
  }

  const rateLimitDelete = await supabaseAdmin
    .from('api_rate_limit_buckets')
    .delete({ count: 'exact' })
    .lt('window_started_at', rateLimitCutoff);

  if (rateLimitDelete.error) {
    throw new Error(
      `Old API rate-limit buckets could not be cleaned: ${rateLimitDelete.error.message}`,
    );
  }

  const runtimeLockCleanup = await supabaseAdmin.rpc(
    'cleanup_expired_operator_runtime_locks',
  );

  if (runtimeLockCleanup.error) {
    throw new Error(
      `Expired operator runtime locks could not be cleaned: ${runtimeLockCleanup.error.message}`,
    );
  }

  return {
    expiredChallengesDeleted: countDeleted(challengeDelete.count),
    staleSessionsDeleted: countDeleted(sessionDelete.count),
    oldRateLimitBucketsDeleted: countDeleted(rateLimitDelete.count),
    expiredRuntimeLocksDeleted: readNumericResult(runtimeLockCleanup.data),
    productAnalyticsCompactedDays: 0,
    productAnalyticsEventsDeleted: 0,
    analyticsCompactedDays: 0,
    analyticsSessionsDeleted: 0,
    analyticsVisitorsDeleted: 0,
  };
}
