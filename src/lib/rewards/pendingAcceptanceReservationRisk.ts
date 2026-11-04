import { pendingAgeWeights } from './rewardForecastPendingWeights.ts';

/**
 * Pending, unaccepted invitations do not yet have an immutable reward cohort.
 * A thirty-day-old unaccepted link is not equivalent to a new active user,
 * but new links still reserve prospective demand in the completion-time quote.
 *
 * Age weights are the SAME weights used in the public reward forecast.
 * Rounding up to whole virtual pending participants makes the payout quote
 * conservatively LESS than or equal to the age-weighted demand projection.
 */
export function ageWeightedPendingAcceptanceStressCount(
  createdAtValues: readonly string[],
  nowMs: number,
): number {
  if (!Array.isArray(createdAtValues) || !Number.isFinite(nowMs)) {
    throw new Error('Pending acceptance demand evidence is invalid.');
  }
  let stressBps = 0;
  for (const createdAt of createdAtValues) {
    if (typeof createdAt !== 'string') {
      throw new Error('Pending acceptance creation time is invalid.');
    }
    stressBps += pendingAgeWeights(createdAt, nowMs).stressBps;
    if (!Number.isSafeInteger(stressBps)) {
      throw new Error('Pending acceptance stress count overflow.');
    }
  }
  // A freshly created invitation has 1000 stress-BPS; old links fall toward
  // zero without deleting the link or modifying any historical entitlements.
  return Math.ceil(stressBps / 1000);
}
