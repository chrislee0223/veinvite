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
  // x-promotion maintenance runs every 15 minutes. Three missed successful
  // cycles is long enough to avoid transient noise while still surfacing a
  // stuck lifecycle or payout worker promptly.
  { name: 'x-promotion-lifecycle', maxAgeMinutes: 45 },
  { name: 'x-promotion-payout', maxAgeMinutes: 45 },
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

export type SybilScanFailureLiveness = {
  failedScans: number;
  failedOver1h: number;
  failedOver24h: number;
};

export function staleSybilScanFailureCodes(failures: SybilScanFailureLiveness): string[] {
  const counts = [
    failures.failedScans,
    failures.failedOver1h,
    failures.failedOver24h,
  ];
  if (
    counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
    failures.failedOver24h > failures.failedOver1h ||
    failures.failedOver1h > failures.failedScans
  ) {
    throw new Error('Invalid Sybil scan failure liveness counts.');
  }

  if (failures.failedOver24h > 0) return ['SYBIL_SCAN_FAILED:24H'];
  if (failures.failedOver1h > 0) return ['SYBIL_SCAN_FAILED:1H'];
  return [];
}

export type XPromotionLiveness = {
  liveEnabled: boolean;
  payoutEnabled: boolean;
  externalVerificationReady: boolean;
  runtimeReady: boolean;
  // Safe operational diagnostics only; no credentials, posts, or wallets.
  runtimeProbeStatus?: string;
  runtimeProbeState?: 'READY' | 'EXPIRED' | 'UNAVAILABLE';
  runtimeProbeAgeSeconds?: number | null;
};

// Read-only X bonus backlog flags. Keep raw wallet/post identifiers out of
// the watchdog alarm fingerprint and do not affect core payout decisions.
export type XPromotionPipelineLiveness = {
  pendingPostStalled: boolean;
  finalCheckStalled: boolean;
  payoutStalled: boolean;
};

export function xPromotionPipelineCodes(
  state: XPromotionPipelineLiveness,
  gate: XPromotionLiveness,
): string[] {
  const values = [
    state.pendingPostStalled,
    state.finalCheckStalled,
    state.payoutStalled,
  ];
  if (values.some((value) => typeof value !== 'boolean')) {
    throw new Error('Invalid X promotion pipeline liveness state.');
  }
  if (!gate.liveEnabled || !gate.payoutEnabled) return [];

  const codes: string[] = [];
  if (state.pendingPostStalled) codes.push('X_PROMOTION_POST_VERIFICATION_STALLED');
  if (state.finalCheckStalled) codes.push('X_PROMOTION_FINAL_CHECK_STALLED');
  if (state.payoutStalled) codes.push('X_PROMOTION_PAYOUT_STALLED');
  return codes;
}


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

export function xPromotionGateCodes(
  state: XPromotionLiveness,
): string[] {
  const values = [
    state.liveEnabled,
    state.payoutEnabled,
    state.externalVerificationReady,
    state.runtimeReady,
  ];
  if (values.some((value) => typeof value !== 'boolean')) {
    throw new Error('Invalid X promotion liveness state.');
  }

  // Ignore intentionally inactive campaign states. Once LIVE + payout are
  // enabled, the gate/runtime boundary must stay coherent.
  if (!state.liveEnabled || !state.payoutEnabled) return [];

  if (state.externalVerificationReady && !state.runtimeReady) {
    return ['X_PROMOTION_GATE_ON_WHILE_RUNTIME_NOT_READY'];
  }
  if (!state.externalVerificationReady && state.runtimeReady) {
    return ['X_PROMOTION_GATE_OFF_WHILE_RUNTIME_READY'];
  }
  return [];
}

export function isReliabilityDegraded(codes: readonly string[]): boolean {
  // Aged 1-hour HOLD reviews and a safely-closed X gate are operator warnings,
  // not whole-application outages. A gate left open while runtime is not
  // ready, stale critical jobs, or a 24-hour HOLD remain degraded.
  const warnings = new Set([
    'SYBIL_EARLY_HOLD_STALLED:1H',
    'SYBIL_SCAN_FAILED:1H',
    'X_PROMOTION_GATE_OFF_WHILE_RUNTIME_READY',
    'X_PROMOTION_POST_VERIFICATION_STALLED',
    'X_PROMOTION_FINAL_CHECK_STALLED',
    'X_PROMOTION_PAYOUT_STALLED',
  ]);
  return codes.some((code) => !warnings.has(code));
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
