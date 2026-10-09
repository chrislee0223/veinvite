/**
 * Observation-only, deterministic fair sampling. A permanently failing
 * referral must not pin the entire daily scan to the first few candidates.
 * The day-based rotation uses NO durable cursor and cannot affect rewards.
 */
export function selectRotatingObservationCandidates<T>({
  pending,
  epochDay,
  maxAttempts,
}: {
  pending: T[];
  epochDay: number;
  maxAttempts: number;
}): T[] {
  if (
    !Number.isSafeInteger(epochDay) ||
    epochDay < 0 ||
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1
  ) {
    throw new Error('Invalid observation sampling parameters.');
  }
  if (pending.length === 0) return [];
  const limit = Math.min(pending.length, maxAttempts);
  const start = ((epochDay % pending.length) * (limit % pending.length)) %
    pending.length;
  return Array.from({ length: limit }, (_, index) =>
    pending[(start + index) % pending.length],
  );
}
