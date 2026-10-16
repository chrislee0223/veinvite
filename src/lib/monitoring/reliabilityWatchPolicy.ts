export type JobHeartbeat = {
  job_name: string;
  last_succeeded_at: string | null;
};

export const RELIABILITY_JOBS = [
  { name: 'vote-reconcile', maxAgeMinutes: 30 },
  { name: 'vote-reconcile:submitted-payout-recovery', maxAgeMinutes: 30 },
  { name: 'vote-reconcile:sybil-reward-recovery', maxAgeMinutes: 30 },
  { name: 'vote-reconcile:full-fallback', maxAgeMinutes: 90 },
  { name: 'vote-reconcile:reward-boost-reserve', maxAgeMinutes: 120 },
  { name: 'daily-reconcile', maxAgeMinutes: 30 * 60 },
  { name: 'analytics-maintenance', maxAgeMinutes: 30 * 60 },
] as const;

const FINGERPRINT_PREFIX = 'WATCH_V1:';

export function staleCronCodes(
  rows: readonly JobHeartbeat[],
  now: number,
): string[] {
  const byName = new Map(rows.map((row) => [row.job_name, row.last_succeeded_at]));
  return RELIABILITY_JOBS.filter(({ name, maxAgeMinutes }) => {
    const raw = byName.get(name);
    const at = raw ? Date.parse(raw) : NaN;
    return !Number.isFinite(at) ||
      at > now ||
      now - at >= maxAgeMinutes * 60_000;
  }).map(({ name }) => `CRON_STALE:${name}`);
}

export function delayedRewardCode(missingCount: number): string[] {
  if (!Number.isSafeInteger(missingCount) || missingCount < 0) {
    throw new Error('Invalid delayed reward count.');
  }
  if (missingCount === 0) return [];
  const band = missingCount === 1 ? '1' : missingCount < 5 ? '2-4' : '5+';
  return [`REWARD_RESERVATION_DELAY:${band}`];
}

export type SybilHoldLiveness = {
  openHolds: number;
  incompleteCoreHolds: number;
  stalledOver1h: number;
  stalledOver24h: number;
};

// Review delays are actionable even when a wallet has completed all core
// checks: an operator still has to decide CLEAR/BLOCKED. Do not use any HOLD
// liveness signal to change wallet/reward authority automatically.
export function staleSybilHoldCodes(held: SybilHoldLiveness): string[] {
  const counts = [
    held.openHolds,
    held.incompleteCoreHolds,
    held.stalledOver1h,
    held.stalledOver24h,
  ];
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
      held.stalledOver24h > held.stalledOver1h ||
      held.stalledOver1h > held.openHolds ||
      held.incompleteCoreHolds > held.openHolds) {
    throw new Error('Invalid Sybil HOLD liveness counts.');
  }

  if (held.stalledOver24h > 0) return ['SYBIL_EARLY_HOLD_STALLED:24H'];
  if (held.stalledOver1h > 0) return ['SYBIL_EARLY_HOLD_STALLED:1H'];
  return [];
}

export function isReliabilityDegraded(codes: readonly string[]): boolean {
  // An aged, still-open 1-hour operator review is a warning, not a platform
  // outage. A review still open past 24 hours becomes a critical fault.
  return codes.some((code) => code !== 'SYBIL_EARLY_HOLD_STALLED:1H');
}

export function stableAlarmCodes(codes: readonly string[]): string[] {
  return [...new Set(codes)].sort();
}

export function encodeAlarmState(codes: readonly string[]): string | null {
  const normalized = stableAlarmCodes(codes);
  return normalized.length ? FINGERPRINT_PREFIX + normalized.join(',') : null;
}

export function decodeAlarmState(value: string | null): string[] {
  if (!value?.startsWith(FINGERPRINT_PREFIX)) return [];
  return stableAlarmCodes(value.slice(FINGERPRINT_PREFIX.length).split(',').filter(Boolean));
}

export function alarmChanges(previous: readonly string[], current: readonly string[]) {
  const old = new Set(previous);
  const next = new Set(current);
  return {
    newlyActive: current.filter((code) => !old.has(code)),
    resolved: previous.filter((code) => !next.has(code)),
  };
}
