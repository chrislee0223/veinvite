import { supabaseAdmin } from '@/lib/supabaseServer';

const CHALLENGE_RETENTION_MS = 60 * 60 * 1000;
const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

export type EphemeralCleanupSummary = {
  expiredChallengesDeleted: number;
  staleSessionsDeleted: number;
  oldRateLimitBucketsDeleted: number;
};

function countDeleted(value: number | null) {
  return typeof value === 'number' && value > 0 ? value : 0;
}

/**
 * Removes only short-lived security/runtime state that is no longer usable.
 *
 * This intentionally never touches invitations, impact proofs, Sybil audit
 * events, reward/accounting records, monitoring snapshots, or payout data.
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

  return {
    expiredChallengesDeleted: countDeleted(challengeDelete.count),
    staleSessionsDeleted: countDeleted(sessionDelete.count),
    oldRateLimitBucketsDeleted: countDeleted(rateLimitDelete.count),
  };
}
