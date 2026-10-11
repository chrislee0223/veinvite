/**
 * Public reward estimates are advisory, not payout authority.  A browser
 * must never make old estimates look newer simply by re-saving them.
 */
export const FORECAST_MAX_AGE_MS = 24 * 60 * 60_000;
export const FORECAST_STALE_AFTER_MS = 60 * 60_000;
export const FORECAST_FUTURE_CLOCK_SKEW_MS = 2 * 60_000;
export const FORECAST_RECENT_SNAPSHOT_MS = 60_000;

export function forecastSnapshotAgeMs(
  generatedAt: unknown,
  nowMs: number,
): number | null {
  if (typeof generatedAt !== 'string') return null;
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedMs)) return null;
  const ageMs = nowMs - generatedMs;
  if (
    ageMs < -FORECAST_FUTURE_CLOCK_SKEW_MS ||
    ageMs > FORECAST_MAX_AGE_MS
  ) return null;
  return ageMs;
}

export function isRestorableRewardForecast(input: {
  savedAt: unknown;
  generatedAt: unknown;
  modelVersion: unknown;
  status: unknown;
  expectedModelVersion: string;
  nowMs: number;
}): boolean {
  if (input.status !== 'ready' || input.modelVersion !== input.expectedModelVersion) {
    return false;
  }
  if (typeof input.savedAt !== 'number' || !Number.isFinite(input.savedAt)) {
    return false;
  }
  const savedAgeMs = input.nowMs - input.savedAt;
  if (savedAgeMs < 0 || savedAgeMs > FORECAST_MAX_AGE_MS) return false;
  return forecastSnapshotAgeMs(input.generatedAt, input.nowMs) !== null;
}

export function isRewardForecastStale(input: {
  generatedAt: unknown;
  nowMs: number;
  stale?: boolean;
  savedAt?: number;
}): boolean {
  const ageMs = forecastSnapshotAgeMs(input.generatedAt, input.nowMs);
  if (ageMs === null) return true;
  const storageAge = input.savedAt === undefined
    ? 0
    : input.nowMs - input.savedAt;
  return input.stale === true ||
    ageMs > FORECAST_STALE_AFTER_MS ||
    storageAge > FORECAST_STALE_AFTER_MS;
}

/** A brand-new snapshot does not need an immediate duplicate live read. */
export function needsImmediateLiveForecastRefresh(input: {
  generatedAt: unknown;
  status: string;
  stale?: boolean;
  nowMs: number;
}): boolean {
  if (input.status !== 'ready' || input.stale === true) return true;
  const age = forecastSnapshotAgeMs(input.generatedAt, input.nowMs);
  return age === null || age > FORECAST_RECENT_SNAPSHOT_MS;
}
