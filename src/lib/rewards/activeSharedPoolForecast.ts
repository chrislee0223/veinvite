/**
 * Public participation guidance, NEVER an immutable payout quote.
 *
 * Count recent accepted invitations, including people who have not begun
 * a mission yet. Never count an unopened slot or a hypothetical newcomer.
 * Settlement remains exclusively with the canonical server-side writer.
 */
export const PUBLIC_ACTIVE_FORECAST_MODEL_VERSION = 'shared-pool-recent-accepted-v3';
export type ActiveReferralForecastRow = {
  status: string | null;
  sybil_status: string | null;
  reward_status: string | null;
  apps_completed: number | null;
  activated_at: string | null;
  apps_completed_at: string | null;
  vote_completed_at: string | null;
  vote_round_id: number | null;
};

export const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

function isRecentlyActive(value: string | null, cutoff: number, nowMs: number): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) &&
    timestamp >= cutoff && timestamp <= nowMs + FUTURE_SKEW_MS;
}

export function countActiveSharedPoolReferrals(
  rows: readonly ActiveReferralForecastRow[],
  currentRoundId: number,
  nowMs: number,
): number {
  if (!Number.isSafeInteger(currentRoundId) || currentRoundId < 1 ||
      !Number.isFinite(nowMs)) {
    throw new Error('Invalid reward forecast context');
  }
  const cutoff = nowMs - ACTIVE_WINDOW_MS;
  return rows.filter((row) => {
    if (row.status !== 'ACTIVATING' && row.status !== 'COMPLETED') return false;
    if (row.sybil_status === 'BLOCKED' ||
        row.reward_status === 'PAID' || row.reward_status === 'FORFEITED') return false;
    // A verified completion in this round remains a possible recipient even
    // if its original invitation was created in an older round.
    if (row.status === 'COMPLETED' && row.vote_round_id === currentRoundId) {
      return true;
    }
    if (row.status !== 'ACTIVATING') return false;
    // Accepting an actual invitation (even at 0 missions) enters the
    // participation estimate. Old invitations never enter solely because
    // a historical member later progressed a mission.
    return isRecentlyActive(row.activated_at, cutoff, nowMs);
  }).length;
}

export function estimateActiveSharedPoolReward(
  oneWinnerWei: string,
  xReservePerWinnerWei: string,
  recentAcceptedCount: number,
): { estimatedRewardWei: string; projectedRecipients: number } {
  if (!/^(0|[1-9][0-9]*)$/.test(oneWinnerWei) ||
      !/^(0|[1-9][0-9]*)$/.test(xReservePerWinnerWei) ||
      !Number.isSafeInteger(recentAcceptedCount) ||
      recentAcceptedCount < 0 || recentAcceptedCount >= 999) {
    throw new Error('Invalid public shared-pool estimate input');
  }
  // The minimum one-winner scenario is illustrative when nobody has joined.
  // Count actual recent acceptances without inventing future participants.
  // This is a public guide, not a reservation or guaranteed payout.
  const projectedRecipients = Math.max(1, recentAcceptedCount);
  if (oneWinnerWei === '0') {
    return { estimatedRewardWei: '0', projectedRecipients };
  }
  const one = BigInt(oneWinnerWei);
  const x = BigInt(xReservePerWinnerWei);
  const count = BigInt(projectedRecipients);
  const capacity = one + x;
  const afterX = capacity - count * x;
  return {
    estimatedRewardWei: (afterX > 0n ? afterX / count : 0n).toString(),
    projectedRecipients,
  };
}
