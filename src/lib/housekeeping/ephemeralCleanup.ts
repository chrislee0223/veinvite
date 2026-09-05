import { supabaseAdmin } from '@/lib/supabaseServer';

const CHALLENGE_RETENTION_MS = 60 * 60 * 1000;
const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;
const USAGE_ANALYTICS_RETENTION_DAYS = 30;

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
 * events, reward/accounting records, monitoring snapshots, or payout data.
 * Expired operator leases are retained for one extra hour before deletion so
 * cleanup cannot race a lease that has only just crossed its expiry boundary.
 * Anonymous analytics is handled separately: product events and usage-session
 * rows older than 30 Seoul-calendar days are first finalized into
 * identifier-free daily rollups, then the raw anonymous rows are removed.
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

  // Compact product events first while the current anonymous exclusion markers
  // are still present. Usage compaction can then safely remove orphaned daily
  // visitor/exclusion hashes after all raw analytics for that day are gone.
  const productAnalyticsCompact = await supabaseAdmin.rpc(
    'compact_app_product_analytics',
    {
      p_retention_days:
        USAGE_ANALYTICS_RETENTION_DAYS,
    },
  );

  if (productAnalyticsCompact.error) {
    throw new Error(
      `Old product analytics could not be compacted: ${productAnalyticsCompact.error.message}`,
    );
  }

  const productAnalyticsRow = Array.isArray(
    productAnalyticsCompact.data,
  )
    ? productAnalyticsCompact.data[0]
    : productAnalyticsCompact.data;

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
    expiredRuntimeLocksDeleted: readNumericResult(runtimeLockCleanup.data),
    productAnalyticsCompactedDays: readNumericField(
      productAnalyticsRow,
      'compacted_days',
    ),
    productAnalyticsEventsDeleted: readNumericField(
      productAnalyticsRow,
      'events_deleted',
    ),
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
