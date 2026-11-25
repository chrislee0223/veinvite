/**
 * Public participation guidance, NEVER an immutable payout quote.
 *
 * Count recent accepted invitations, including people who have not begun
 * a mission yet. Never count an unopened slot or a hypothetical newcomer.
 * Settlement remains exclusively with the canonical server-side writer.
 */
export const PUBLIC_ACTIVE_FORECAST_MODEL_VERSION = 'shared-pool-recent-accepted-v6';
export type ActiveReferralForecastRow = {
  invite_code?: string;
  retry_active?: boolean;
  created_at?: string | null;
  slot_released_at?: string | null;
  status: string | null;
  sybil_status: string | null;
  reward_status: string | null;
  ineligible_at: string | null;
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

function activeSharedPoolReferrals(
  rows: readonly ActiveReferralForecastRow[],
  currentRoundId: number,
  nowMs: number,
): readonly ActiveReferralForecastRow[] {
  if (!Number.isSafeInteger(currentRoundId) || currentRoundId < 1 ||
      !Number.isFinite(nowMs)) {
    throw new Error('Invalid reward forecast context');
  }
  const cutoff = nowMs - ACTIVE_WINDOW_MS;
  return rows.filter((row) => {
    if (row.status !== 'ACTIVATING' && row.status !== 'COMPLETED') return false;
    if (row.sybil_status === 'BLOCKED' ||
        row.ineligible_at != null ||
        // Canonical reservation and full recovery settlement release the slot
        // in the same transaction. Its funds are no longer in free capacity.
        row.slot_released_at != null ||
        row.reward_status === 'PAID' || row.reward_status === 'FORFEITED') return false;
    // A verified completion in this round remains a possible recipient even
    // if its original invitation was created in an older round.
    if (row.status === 'COMPLETED' && row.vote_round_id === currentRoundId) {
      return true;
    }
    if (row.status !== 'ACTIVATING') return false;
    // A reset itself is not new participation. Require a fresh, durable dApp event.
    if (row.retry_active === true) return true;
    // Accepting an actual invitation (even at 0 missions) enters the
    // participation estimate. Old invitations never enter solely because
    // a historical member later progressed a mission.
    return isRecentlyActive(row.activated_at, cutoff, nowMs);
  });
}

export function countActiveSharedPoolReferrals(
  rows: readonly ActiveReferralForecastRow[],
  currentRoundId: number,
  nowMs: number,
): number {
  return activeSharedPoolReferrals(rows,currentRoundId,nowMs).length;
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

/** Private server-side forecast; existing invitations retain their enrollment policy.
 * The UI receives only the resulting amount, not the cutover or policy split.
 * No immutable payout authority is granted to this estimate.
 */
export function estimatePolicyAwareActiveSharedPoolReward(
  capacityWei: string,
  legacyReserveWei: string,
  rows: readonly ActiveReferralForecastRow[],
  currentRoundId: number,
  nowMs: number,
  cutoverAt: string | null,
  sunsetAt: string | null,
): { estimatedRewardWei: string; projectedRecipients: number } {
  if (!/^(0|[1-9][0-9]*)$/.test(capacityWei) ||
      !/^(0|[1-9][0-9]*)$/.test(legacyReserveWei)) {
    throw new Error('Invalid policy-aware capacity');
  }
  const cutover = cutoverAt === null ? null : Date.parse(cutoverAt);
  const sunset = sunsetAt === null ? null : Date.parse(sunsetAt);
  if ((cutover !== null && !Number.isFinite(cutover)) ||
      (sunset !== null && (!Number.isFinite(sunset) || cutover === null || sunset <= cutover))) {
    throw new Error('Invalid private reward policy window');
  }
  const active = activeSharedPoolReferrals(rows,currentRoundId,nowMs);
  if (active.length >= 999) throw new Error('Too many active referrals');
  const isLegacy = (created: number) =>
    cutover === null || created < cutover || (sunset !== null && created >= sunset);
  const legacyCount = active.length === 0
    ? Number(isLegacy(nowMs))
    : active.filter(row => {
        const created = row.created_at ? Date.parse(row.created_at) : NaN;
        if (!Number.isFinite(created)) throw new Error('Missing invite policy creation time');
        return isLegacy(created);
      }).length;
  const projectedRecipients = Math.max(1,active.length);
  const available = BigInt(capacityWei)-BigInt(legacyCount)*BigInt(legacyReserveWei);
  return {
    estimatedRewardWei: (available > 0n ? available/BigInt(projectedRecipients) : 0n).toString(),
    projectedRecipients,
  };
}
