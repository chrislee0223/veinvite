/**
 * Historical completion-demand safety bound.  Uses only completed, Sybil-clean
 * cohort counts supplied by read_reward_forecast_history; never uses anonymous
 * invite attempts or a current cohort whose payouts have not yet settled.
 *
 * The observed upper quartile is less sensitive to one exceptional week than
 * the maximum, while a minimum of three funded slots and two separate future
 * stress entrants remain in the actual reservation policy.
 */
export const RECIPIENT_DEMAND_HISTORY_LIMIT = 8;
export const RECIPIENT_DEMAND_MIN_SAMPLES = 4;
export const RECIPIENT_DEMAND_MIN_FLOOR = 3;
export const RECIPIENT_DEMAND_MAX_FLOOR = 8;

export function calculateRecipientDemandFloor(history: number[]): number {
  if (!Array.isArray(history) || history.length > RECIPIENT_DEMAND_HISTORY_LIMIT) {
    throw new Error('Recipient demand history is invalid.');
  }
  const values = history.map((count) => {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('Recipient demand history contains an invalid count.');
    }
    return count;
  });
  if (values.length < RECIPIENT_DEMAND_MIN_SAMPLES) {
    return RECIPIENT_DEMAND_MIN_FLOOR;
  }
  values.sort((a, b) => a - b);
  // Nearest-rank 75th percentile across completed funding cohorts.
  const rank = Math.ceil(values.length * 0.75) - 1;
  return Math.max(
    RECIPIENT_DEMAND_MIN_FLOOR,
    Math.min(RECIPIENT_DEMAND_MAX_FLOOR, values[rank]),
  );
}
