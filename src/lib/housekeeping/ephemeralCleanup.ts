import { supabaseAdmin } from '@/lib/supabaseServer';

const CHALLENGE_RETENTION_MS = 60 * 60 * 1000;
const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;
const RUNTIME_LOCK_RETENTION_MS = 60 * 60 * 1000;
const USAGE_ANALYTICS_RETENTION_DAYS = 30;

export type EphemeralCleanupSummary = {
  expiredChallengesDeleted: number;
  staleSessionsDeleted: number;
  oldRateLimitBucketsDeleted: number;
  expiredRuntimeLocksDeleted: number;
  analyticsCompactedDays: number;
  analyticsSessionsDeleted: number;
  analyticsVisitorsDeleted: number;
};

function countDeleted(value: number | null) {
  return typeof value === 'number' && value > 0 ? value : 0;
}

function readNumericField(
  value: unknown,
  key: string,
): number {
  if (!value || typeof value !== 'object') return 0;
  const candidate = (value as Record<string, unknown>)[key];
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : 0;
}

/**
 * Removes only short-lived security/runtime state that is no longer usable.
 *
 * This intentionally never touches invitations, impact proofs, Sybil audit
 * events, reward/accounting records, monitoring snapshots, or payout data.
 * Expired operator leases are retained for one extra hour before deletion so
 * cleanup cannot race a lease that has only just crossed its expiry boundary.
 * Usage analytics is handled separately: raw anonymous session rows older than
 * 30 Seoul-calendar days are first finalized into identifier-free daily
 * rollups, then the raw sessions and orphaned daily visitor hashes are removed.
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
  const runtimeLockCutoff = new Date(
    now - RUNTIME_LOCK_RETENTION_MS,
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

  const runtimeLockDelete = await supabaseAdmin
    .from('operator_runtime_locks')
    .delete({ count: 'exact' })
    .lt('locked_until', runtimeLockCutoff);

  if (runtimeLockDelete.error) {
    throw new Error(
      `Expired operator runtime locks could not be cleaned: ${runtimeLockDelete.error.message}`,
    );
  }

  const analyticsCompact = await supabaseAdmin.rpc(
    'compact_app_usage_analytics',
    {
      p_retention_days:
        USAGE_ANALYTICS_RETENTION_DAYS,
    },
  );

  if (analyticsCompact.error) {
    throw new Error(
      `Old usage analytics could not be compacted: ${analyticsCompact.error.message}`,
    );
  }

  const analyticsRow = Array.isArray(
    analyticsCompact.data,
  )
    ? analyticsCompact.data[0]
    : analyticsCompact.data;

  return {
    expiredChallengesDeleted: countDeleted(challengeDelete.count),
    staleSessionsDeleted: countDeleted(sessionDelete.count),
    oldRateLimitBucketsDeleted: countDeleted(rateLimitDelete.count),
    expiredRuntimeLocksDeleted: countDeleted(runtimeLockDelete.count),
    analyticsCompactedDays: readNumericField(
      analyticsRow,
      'compacted_days',
    ),
    analyticsSessionsDeleted: readNumericField(
      analyticsRow,
      'sessions_deleted',
    ),
    analyticsVisitorsDeleted: readNumericField(
      analyticsRow,
      'visitors_deleted',
    ),
  };
}
