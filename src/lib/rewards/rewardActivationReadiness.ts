/**
 * Read-only activation readiness math. Never authorizes, reserves, releases,
 * signs, claims or pays B3TR. Protected historical budget is not escrow.
 */
const WEI = /^(0|[1-9]\d*)$/;

function parseWei(value: string, label: string): bigint {
  if (!WEI.test(value)) {
    throw new Error('Invalid exact Wei in reward readiness: ' + label);
  }
  return BigInt(value);
}

function parseCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid reward readiness count: ' + label);
  }
  return value;
}

export type RewardActivationReadinessInputs = {
  nowMs: number;
  onchainPoolWei: string;
  forecastPoolWei: string;
  forecastObservedAt: string;
  historicalRetainedWei: string;
  recentCohortProtectedWei: string;
  snapshotReleaseCeilingWei: string;
  releaseLedgerWei: string;
  releaseEvents: number;
  unreviewedUnpaidInvites: number;
  eligibleUnpaidInvites: number;
  threeAppsVoteMissingInvites: number;
  admissionBridgeStatus: 'STAGING_DISABLED' | 'COHORT_OVERCOMMITTED';
  distributionPaused: boolean;
};

export function summarizeRewardActivationReadiness(
  v: RewardActivationReadinessInputs,
) {
  const onchain = parseWei(v.onchainPoolWei, 'onchainPoolWei');
  const forecast = parseWei(v.forecastPoolWei, 'forecastPoolWei');
  const retained = parseWei(v.historicalRetainedWei, 'historicalRetainedWei');
  const recent = parseWei(v.recentCohortProtectedWei, 'recentCohortProtectedWei');
  const ceiling = parseWei(v.snapshotReleaseCeilingWei, 'snapshotReleaseCeilingWei');
  const released = parseWei(v.releaseLedgerWei, 'releaseLedgerWei');
  parseCount(v.releaseEvents, 'releaseEvents');
  parseCount(v.unreviewedUnpaidInvites, 'unreviewedUnpaidInvites');
  parseCount(v.eligibleUnpaidInvites, 'eligibleUnpaidInvites');
  parseCount(v.threeAppsVoteMissingInvites, 'threeAppsVoteMissingInvites');
  if (v.threeAppsVoteMissingInvites > v.unreviewedUnpaidInvites) {
    throw new Error('Incomplete invite subset exceeds unreviewed invites');
  }
  if (!Number.isFinite(v.nowMs)) {
    throw new Error('Invalid observation timestamp');
  }
  const observedMs = Date.parse(v.forecastObservedAt);
  const ageMs = v.nowMs - observedMs;
  const fresh = Number.isFinite(observedMs)
    && ageMs >= 0 && ageMs <= 30 * 60_000;
  if (v.admissionBridgeStatus !== 'STAGING_DISABLED'
      && v.admissionBridgeStatus !== 'COHORT_OVERCOMMITTED') {
    throw new Error('Unreviewed admission bridge state');
  }
  if (typeof v.distributionPaused !== 'boolean') {
    throw new Error('Invalid distribution pause flag');
  }
  const reasons: string[] = [];
  if (!fresh) reasons.push('FORECAST_SNAPSHOT_STALE');
  if (onchain !== forecast) reasons.push('POOL_CHANGED_SINCE_SNAPSHOT');
  if (released > ceiling) reasons.push('HISTORICAL_RELEASE_EXCEEDS_CEILING');
  if (released === ceiling) reasons.push('NO_UNRELEASED_CAPACITY_IN_PLAN');
  if (v.unreviewedUnpaidInvites > 0) reasons.push('UNREVIEWED_UNPAID_INVITES');
  if (v.eligibleUnpaidInvites > 0) reasons.push('ELIGIBLE_UNPAID_INVITES');
  if (v.distributionPaused) reasons.push('DISTRIBUTION_PAUSED');
  if (v.admissionBridgeStatus === 'COHORT_OVERCOMMITTED') {
    reasons.push('COHORT_OVERCOMMITTED');
  }
  // A hard-disabled bridge MUST never be read as permission to activate.
  reasons.push('ADMISSION_WRITER_AND_PAYOUT_NOT_AUTHORIZED');

  return {
    mode: 'READ_ONLY' as const,
    enabled: false as const,
    canActivate: false as const,
    canReleaseHistoricalProtection: false as const,
    canSign: false as const,
    writesPerformed: false as const,
    transfersPerformed: false as const,
    reasons,
    onchainPoolWei: onchain.toString(),
    lastForecastPoolWei: forecast.toString(),
    poolChangedSinceForecast: onchain !== forecast,
    forecastObservedAt: v.forecastObservedAt,
    forecastFresh: fresh,
    historicalProtectedSnapshotWei: (retained + recent).toString(),
    alreadyReleasedToDestinationWei: released.toString(),
    snapshotReleaseCeilingWei: ceiling.toString(),
    unreleasedSnapshotCapacityWei: (released >= ceiling ? 0n : ceiling - released).toString(),
    releaseEvents: v.releaseEvents,
    unreviewedUnpaidInvites: v.unreviewedUnpaidInvites,
    eligibleUnpaidInvites: v.eligibleUnpaidInvites,
    threeAppsVoteMissingInvites: v.threeAppsVoteMissingInvites,
    admissionBridgeStatus: v.admissionBridgeStatus,
  };
}
