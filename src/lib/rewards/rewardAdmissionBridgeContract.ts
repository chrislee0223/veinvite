/**
 * Validate the real, service-only PostgreSQL staging bridge result.
 * This is observability, NEVER authority to reserve, promise or pay B3TR.
 * The SQL deployment is permanently disabled pending a separate coherent
 * migration of the canonical X/base/legacy funding readers and writers.
 */
export type AdmissionBridgeScope = {
  network: string;
  appId: string;
  cohortRoundId: string;
  receiptId: string;
};
const NUM = /^(0|[1-9]\d*)$/;
function obj(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) {
    throw new Error('Reward admission bridge returned a non-object');
  }
  return x as Record<string, unknown>;
}
function wei(x: unknown, field: string): bigint {
  if (typeof x !== 'string' || !NUM.test(x)) {
    throw new Error('Invalid exact Wei in reward admission bridge: '+field);
  }
  return BigInt(x);
}
function requiredString(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v) throw new Error('Invalid bridge '+field);
  return v;
}
function requiredBoolean(v: unknown, field: string): boolean {
  if (typeof v !== 'boolean') throw new Error('Invalid bridge flag '+field);
  return v;
}
export function validateStagedAdmissionBridge(input: unknown, scope: AdmissionBridgeScope) {
  const v = obj(input);
  if (v.model !== 'staged-disabled-v1') throw new Error('Unexpected bridge policy');
  if (requiredString(v.network, 'network') !== scope.network
    || requiredString(v.appId, 'appId').toLowerCase() !== scope.appId.toLowerCase()
    || requiredString(v.rewardCohortRoundId, 'rewardCohortRoundId') !== scope.cohortRoundId
    || requiredString(v.allocationReceiptId, 'allocationReceiptId') !== scope.receiptId) {
    throw new Error('Bridge authority scope mismatch');
  }
  for (const field of ['enabled','canAdmit','canGuarantee','canSign','authorizesWrite'] as const) {
    if (requiredBoolean(v[field],field)) throw new Error('Staged bridge is unexpectedly enabled: '+field);
  }
  for (const field of ['requiresAtomicHandoff','requiresXAndRecoveryReconciliation','requiresUncoveredLegacyStressProof'] as const) {
    if (!requiredBoolean(v[field],field)) throw new Error('Missing bridge safety requirement: '+field);
  }
  const physical = wei(v.physicalBaseAndXOutstandingWei,'physicalBaseAndXOutstandingWei');
  const xLive = wei(v.xLiveUnpaidAlreadyIncludedWei,'xLiveUnpaidAlreadyIncludedWei');
  const globalHold = wei(v.unconvertedGlobalHoldsWei,'unconvertedGlobalHoldsWei');
  const cohortHold = wei(v.unconvertedCohortHoldsWei,'unconvertedCohortHoldsWei');
  const lifetime = wei(v.existingCohortLifetimeCommittedWei,'existingCohortLifetimeCommittedWei');
  const budget = wei(v.cohortEffectiveBudgetWei,'cohortEffectiveBudgetWei');
  const globalTotal = wei(v.globalLiabilityIncludingHoldsWei,'globalLiabilityIncludingHoldsWei');
  const cohortTotal = wei(v.cohortLifetimePlusHoldsWei,'cohortLifetimePlusHoldsWei');
  if (xLive > physical || cohortHold > globalHold
    || globalTotal !== physical + globalHold
    || cohortTotal !== lifetime + cohortHold) {
    throw new Error('Reward admission/X funding double count or reconciliation drift');
  }
  const reported = requiredBoolean(v.accountingConsistent,'accountingConsistent');
  if (reported !== (cohortTotal <= budget)) {
    throw new Error('Admission cohort accounting flag does not match exact Wei');
  }
  const count = v.globalHoldsCount;
  if (!Number.isSafeInteger(count) || (count as number)<0) {
    throw new Error('Invalid admission global holds count');
  }
  return {
    status: reported ? 'STAGING_DISABLED' : 'COHORT_OVERCOMMITTED',
    authorizesAdmission: false as const,
    authorizesPayout: false as const,
    originalOutstandingWei: physical.toString(), // already includes X LIVE HELD
    xLiveIncludedWei: xLive.toString(),
    unconvertedGlobalHoldsWei: globalHold.toString(),
    totalPhysicalLiabilityWei: globalTotal.toString(),
    cohortLifetimeIncludingUnconvertedWei: cohortTotal.toString(),
    cohortBudgetWei: budget.toString(),
    globalHoldsCount: count as number,
  };
}
