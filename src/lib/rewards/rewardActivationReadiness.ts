/**
 * Operator-only, non-authorizing activation readiness mathematics.
 * This is NOT permission to release funds, enable admission or sign.
 * Every financial amount is an exact decimal Wei string from either
 * an on-chain read or a reviewed SQL RPC that stringifies NUMERIC values.
 */
const WEI = /^(0|[1-9]\d*)$/;
function wei(value: string, field: string) {
  if (typeof value !== 'string' || !WEI.test(value)) {
    throw new Error('Invalid exact Wei: ' + field);
  }
  return BigInt(value);
}
function count(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid readiness count: ' + field);
  }
  return value;
}
export type RewardActivationReadinessInputs = {
  nowMs: number;
  liveOnchainPoolWei: string;
  latestForecastAt: string;
  sourceRetainedProtectionWei: string;
  recentCohortProtectedWei: string;
  bankBalanceWei: string;
  bankStressReserveWei: string;
  ordinaryBoostAvailableWei: string;
  sourceOverrunCount: number;
  destinationOverrunCount: number;
  unprotectedMatureSourceCount: number;
  conservationOk: boolean;
  stressReserveCovered: boolean;
  unreviewedUnpaidInvites: number;
  eligibleUnpaidInvites: number;
  threeAppsVoteMissingInvites: number;
  admissionBridgeStatus: 'STAGING_DISABLED' | 'COHORT_OVERCOMMITTED';
  distributionPaused: boolean;
};

export function summarizeRewardActivationReadiness(v: RewardActivationReadinessInputs) {
  const pool = wei(v.liveOnchainPoolWei, 'liveOnchainPoolWei');
  const retained = wei(v.sourceRetainedProtectionWei, 'sourceRetainedProtectionWei');
  const recent = wei(v.recentCohortProtectedWei, 'recentCohortProtectedWei');
  const bank = wei(v.bankBalanceWei, 'bankBalanceWei');
  const stress = wei(v.bankStressReserveWei, 'bankStressReserveWei');
  const available = wei(v.ordinaryBoostAvailableWei, 'ordinaryBoostAvailableWei');
  count(v.sourceOverrunCount, 'sourceOverrunCount');
  count(v.destinationOverrunCount, 'destinationOverrunCount');
  count(v.unprotectedMatureSourceCount, 'unprotectedMatureSourceCount');
  count(v.unreviewedUnpaidInvites, 'unreviewedUnpaidInvites');
  count(v.eligibleUnpaidInvites, 'eligibleUnpaidInvites');
  count(v.threeAppsVoteMissingInvites, 'threeAppsVoteMissingInvites');
  if (v.threeAppsVoteMissingInvites > v.unreviewedUnpaidInvites) {
    throw new Error('Incomplete invite subset exceeds unreviewed invites');
  }
  if (typeof v.conservationOk !== 'boolean' ||
      typeof v.stressReserveCovered !== 'boolean' ||
      typeof v.distributionPaused !== 'boolean') {
    throw new Error('Invalid financial readiness flag');
  }
  if (v.admissionBridgeStatus !== 'STAGING_DISABLED' &&
      v.admissionBridgeStatus !== 'COHORT_OVERCOMMITTED') {
    throw new Error('Unreviewed bridge state');
  }
  if (available !== (bank > stress ? bank - stress : 0n)) {
    throw new Error('Reserve-bank available amount is inconsistent');
  }
  const observedAtMs = Date.parse(v.latestForecastAt);
  const snapshotFresh = Number.isFinite(v.nowMs) && Number.isFinite(observedAtMs) &&
    v.nowMs >= observedAtMs && v.nowMs - observedAtMs <= 30 * 60_000;
  const blockers: string[] = [];
  if (!snapshotFresh) blockers.push('POOL_OBSERVATION_STALE');
  if (v.unreviewedUnpaidInvites > 0) blockers.push('UNREVIEWED_UNPAID_INVITES');
  if (v.eligibleUnpaidInvites > 0) blockers.push('ELIGIBLE_UNPAID_INVITES');
  if (v.sourceOverrunCount > 0 || v.destinationOverrunCount > 0 ||
      !v.conservationOk) blockers.push('RESERVE_LEDGER_DRIFT');
  if (!v.stressReserveCovered || bank < stress) blockers.push('STRESS_RESERVE_UNCOVERED');
  if (available === 0n) blockers.push('NO_FREE_RESERVE_BANK_CAPACITY');
  if (v.unprotectedMatureSourceCount > 0) blockers.push('UNPROTECTED_MATURE_SOURCE');
  if (v.distributionPaused) blockers.push('DISTRIBUTION_PAUSED');
  if (v.admissionBridgeStatus === 'COHORT_OVERCOMMITTED') {
    blockers.push('COHORT_OVERCOMMITTED');
  }
  // Admission SQL is explicitly hard-disabled. This diagnostic NEVER
  // upgrades a green accounting report into payout authorization.
  blockers.push('ADMISSION_WRITER_AND_PAYOUT_NOT_AUTHORIZED');
  return {
    mode: 'READ_ONLY' as const,
    canActivate: false as const,
    canSign: false as const,
    canReleaseHistoricalProtection: false as const,
    writesPerformed: false as const,
    transfersPerformed: false as const,
    blockers,
    liveOnchainPoolWei: pool.toString(),
    historicalProtectedSnapshotWei: (retained + recent).toString(),
    retainedProtectedWei: retained.toString(),
    recentProtectedWei: recent.toString(),
    bankBalanceWei: bank.toString(),
    bankStressReserveWei: stress.toString(),
    ordinaryBoostAvailableWei: available.toString(),
    latestForecastAt: v.latestForecastAt,
    forecastFresh: snapshotFresh,
    sourceOverrunCount: v.sourceOverrunCount,
    destinationOverrunCount: v.destinationOverrunCount,
    unprotectedMatureSourceCount: v.unprotectedMatureSourceCount,
    unreviewedUnpaidInvites: v.unreviewedUnpaidInvites,
    eligibleUnpaidInvites: v.eligibleUnpaidInvites,
    threeAppsVoteMissingInvites: v.threeAppsVoteMissingInvites,
    admissionBridgeStatus: v.admissionBridgeStatus,
  };
}
