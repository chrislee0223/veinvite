/**
 * Public recruitment guidance, never a payout quote.
 *
 * A prospective invite counts as one participant in addition to distinct,
 * recently active existing referrals. Do not escrow or promise this estimate.
 * Settlement still exclusively uses the canonical server-side writer.
 */
export type ActiveReferralForecastRow = {
  status: string | null;
  sybil_status: string | null;
  reward_status: string | null;
  activated_at: string | null;
  apps_completed_at: string | null;
  vote_completed_at: string | null;
  vote_round_id: number | null;
};

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
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
    return isRecentlyActive(row.activated_at, cutoff, nowMs) ||
      isRecentlyActive(row.apps_completed_at, cutoff, nowMs) ||
      isRecentlyActive(row.vote_completed_at, cutoff, nowMs);
  }).length;
}

export function estimateProspectiveSharedPoolReward(
  oneWinnerWei: string,
  xReservePerWinnerWei: string,
  activeExistingCount: number,
): { estimatedRewardWei: string; projectedRecipients: number } {
  if (!/^(0|[1-9][0-9]*)$/.test(oneWinnerWei) ||
      !/^(0|[1-9][0-9]*)$/.test(xReservePerWinnerWei) ||
      !Number.isSafeInteger(activeExistingCount) ||
      activeExistingCount < 0 || activeExistingCount >= 999) {
    throw new Error('Invalid public shared-pool estimate input');
  }
  // One-winner quote equals available capacity minus one X-option reserve.
  // Reconstruct gross capacity only while that quote is strictly positive.
  // This is approximate guidance; do not use for immutable reservations.
  if (oneWinnerWei === '0') {
    return { estimatedRewardWei: '0', projectedRecipients: activeExistingCount + 1 };
  }
  const one = BigInt(oneWinnerWei);
  const x = BigInt(xReservePerWinnerWei);
  const projectedRecipients = activeExistingCount + 1;
  const count = BigInt(projectedRecipients);
  const capacity = one + x;
  const afterX = capacity - count * x;
  return {
    estimatedRewardWei: (afterX > 0n ? afterX / count : 0n).toString(),
    projectedRecipients,
  };
}
