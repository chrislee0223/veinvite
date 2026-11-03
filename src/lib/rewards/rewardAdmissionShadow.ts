/**
 * Pure, read-only admission guarantee preview. A positive preview NEVER
 * authorizes admission, funding, a payout promise, or a token transfer.
 *
 * A real integration needs an atomic DB transaction/lock, an idempotent ledger,
 * a fresh chain observation, verified cohort receipt and disjoint liabilities.
 * Lifetime cohort commitments include historical PAID amounts, which should
 * not be subtracted again from the current physical pool.
 */
export type AdmissionShadowInput = {
  cohortEffectiveBudgetWei: string;
  cohortLifetimeCommittedWei: string;
  existingCohortMinimumReservationsWei: string;
  physicalPoolWei: string;
  unpaidFixedLiabilitiesWei: string;
  protectedOlderCohortsWei: string;
  otherReservedLiabilitiesWei: string;
  safetyBufferWei: string;
  uncoveredOlderCompletionStressWei: string;
  minimumPerNewAdmissionWei: string;
  requestedNewAdmissions: number;
  currentAdmissionCount: number;
  poolObservedAt: string;
  evaluatedAt: string;
  fundingReceiptVerified: boolean;
  liabilitiesReconciled: boolean;
  acceptingNewAdmissions: boolean;
};
export type AdmissionShadowStatus =
  | 'WOULD_FIT' | 'FUNDING_EVIDENCE_MISSING' | 'STALE_POOL_OBSERVATION'
  | 'LIABILITIES_UNVERIFIED' | 'UNRESOLVED_LEGACY_STRESS'
  | 'ACCOUNTING_INCONSISTENT' | 'ADMISSION_CLOSED' | 'INSUFFICIENT_FUNDS';
const NUMERIC = /^(0|[1-9][0-9]*)$/;
function wei(value: string, name: string): bigint {
  if (typeof value !== 'string' || !NUMERIC.test(value)) {
    throw new Error(name + ': invalid non-negative canonical wei');
  }
  return BigInt(value);
}
function count(value: number, name: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(name + ': invalid non-negative count');
  }
  return BigInt(value);
}
function timestamp(value: string, name: string): number {
  if (typeof value !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(value)) {
    throw new Error(name + ': timezone-qualified timestamp required');
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(name + ': invalid timestamp');
  return time;
}
const remaining = (a: bigint, b: bigint) => a > b ? a - b : 0n;
const min = (a: bigint, b: bigint) => a < b ? a : b;

export function previewRewardAdmission(x: AdmissionShadowInput) {
  const budget = wei(x.cohortEffectiveBudgetWei, 'cohortEffectiveBudgetWei');
  const committed = wei(x.cohortLifetimeCommittedWei, 'cohortLifetimeCommittedWei');
  const reserved = wei(x.existingCohortMinimumReservationsWei, 'existingCohortMinimumReservationsWei');
  const pool = wei(x.physicalPoolWei, 'physicalPoolWei');
  const unpaid = wei(x.unpaidFixedLiabilitiesWei, 'unpaidFixedLiabilitiesWei');
  const older = wei(x.protectedOlderCohortsWei, 'protectedOlderCohortsWei');
  const other = wei(x.otherReservedLiabilitiesWei, 'otherReservedLiabilitiesWei');
  const buffer = wei(x.safetyBufferWei, 'safetyBufferWei');
  const oldStress = wei(x.uncoveredOlderCompletionStressWei, 'uncoveredOlderCompletionStressWei');
  const floor = wei(x.minimumPerNewAdmissionWei, 'minimumPerNewAdmissionWei');
  const requested = count(x.requestedNewAdmissions, 'requestedNewAdmissions');
  const current = count(x.currentAdmissionCount, 'currentAdmissionCount');
  const observedAt = timestamp(x.poolObservedAt, 'poolObservedAt');
  const evaluatedAt = timestamp(x.evaluatedAt, 'evaluatedAt');
  if (floor <= 0n || requested <= 0n) throw new Error('Positive floor/request required');
  if (typeof x.fundingReceiptVerified !== 'boolean' ||
    typeof x.liabilitiesReconciled !== 'boolean' ||
    typeof x.acceptingNewAdmissions !== 'boolean') {
    throw new Error('Runtime flags must be boolean');
  }
  const minAlreadyPromised = current * floor;
  // Physical liability buckets must be disjoint and exclude PAID amounts.
  // Reserved active cohort minimums must NOT occur in other liability buckets.
  const physicallyHeld = unpaid + older + other + buffer + reserved;
  const cohortRemaining = remaining(budget, committed + reserved);
  const physicalRemaining = remaining(pool, physicallyHeld);
  const capacity = min(cohortRemaining, physicalRemaining);
  const seats = capacity / floor;
  const required = requested * floor;
  let status: AdmissionShadowStatus = 'WOULD_FIT';
  if (!x.fundingReceiptVerified) status = 'FUNDING_EVIDENCE_MISSING';
  else if (evaluatedAt < observedAt || evaluatedAt - observedAt > 300000) status = 'STALE_POOL_OBSERVATION';
  else if (!x.liabilitiesReconciled) status = 'LIABILITIES_UNVERIFIED';
  else if (oldStress > 0n) status = 'UNRESOLVED_LEGACY_STRESS';
  else if (committed + reserved > budget || physicallyHeld > pool ||
      reserved < minAlreadyPromised) status = 'ACCOUNTING_INCONSISTENT';
  else if (!x.acceptingNewAdmissions) status = 'ADMISSION_CLOSED';
  else if (required > capacity) status = 'INSUFFICIENT_FUNDS';
  const printable = status === 'WOULD_FIT' || status === 'INSUFFICIENT_FUNDS';
  return {
    modelVersion: 'reward-admission-shadow-v1' as const,
    status,
    authorizesAdmission: false as const,
    writesPerformed: false as const,
    minExistingGuaranteeWei: minAlreadyPromised.toString(),
    cohortAvailableAfterReservationsWei: cohortRemaining.toString(),
    physicalAvailableAfterLiabilitiesWei: physicalRemaining.toString(),
    safeShadowCapacityWei: printable ? capacity.toString() : '0',
    maxAdditionalSeats: printable ? seats.toString() : '0',
    requestedWei: required.toString(),
    implementationPrerequisite: 'ATOMIC_DB_ADMISSION_WITH_IDEMPOTENT_LEDGER' as const,
  };
}
