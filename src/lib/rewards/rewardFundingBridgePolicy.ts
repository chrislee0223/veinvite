/**
 * Cross-system reward funding bridge, pure and DISABLED BY DEFAULT.
 *
 * The Production outstanding reader already includes post-base LIVE X
 * promotion RESERVED/HELD amounts. Do not add them again.
 * The Production cohort commitment reader already includes LIVE X
 * RESERVED/HELD/PAID and valid fraud-recovery offsets.
 *
 * DO NOT import this into live payout/sign/Claim until its inputs are obtained
 * under the same atomic funding authority and the X and recovery contracts
 * have been reverified in a Production-schema clone.
 */
export type RewardFundingBridgeInput = {
  enabled: boolean;
  evidenceVerified: boolean;
  disjointLiabilitySourcesVerified: boolean;
  onchainObservedAt: string;
  evaluatedAt: string;
  physicalPoolWei: string;
  existingOutstandingWei: string;
  existingOutstandingXHeldWei: string;
  futureAdmissionGuaranteesWei: string;
  olderProtectionOutsideExistingWei: string;
  safetyBufferWei: string;
  cohortEffectiveBudgetWei: string;
  cohortLifetimeCommittedWei: string;
  cohortCommittedXReservedHeldPaidWei: string;
  cohortUnconvertedGuaranteesWei: string;
  newMinimumWei: string;
  requestedAdmissions: number;
  unresolvedRecoveryOffset: boolean;
  uncoveredOlderStressWei: string;
};

const DECIMAL = /^(0|[1-9]\d*)$/;
function nonNegativeWei(value: string, field: string): bigint {
  if (typeof value !== 'string' || !DECIMAL.test(value)) {
    throw new Error(`${field}: expected exact non-negative integer Wei`);
  }
  return BigInt(value);
}
function exactTime(value: string, field: string): number {
  if (typeof value !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(value)) {
    throw new Error(`${field}: expected timezone-qualified ISO timestamp`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`${field}: invalid timestamp`);
  return ms;
}
const sub = (x: bigint, y: bigint) => x >= y ? x - y : 0n;

export function previewRewardFundingBridge(input: RewardFundingBridgeInput) {
  const pool = nonNegativeWei(input.physicalPoolWei, 'physicalPoolWei');
  // INCLUDES X RESERVED/HELD obligations (never add X to this number).
  const existing = nonNegativeWei(input.existingOutstandingWei, 'existingOutstandingWei');
  const xHeldIncluded = nonNegativeWei(input.existingOutstandingXHeldWei, 'existingOutstandingXHeldWei');
  const holds = nonNegativeWei(input.futureAdmissionGuaranteesWei, 'futureAdmissionGuaranteesWei');
  const old = nonNegativeWei(input.olderProtectionOutsideExistingWei, 'olderProtectionOutsideExistingWei');
  const buffer = nonNegativeWei(input.safetyBufferWei, 'safetyBufferWei');
  const cohortBudget = nonNegativeWei(input.cohortEffectiveBudgetWei, 'cohortEffectiveBudgetWei');
  // INCLUDES X RESERVED/HELD/PAID + any valid recovery offsets. Historical
  // PAID counts toward this lifetime limit, not current physical obligations.
  const committed = nonNegativeWei(input.cohortLifetimeCommittedWei, 'cohortLifetimeCommittedWei');
  const cohortXIncluded = nonNegativeWei(input.cohortCommittedXReservedHeldPaidWei, 'cohortCommittedXReservedHeldPaidWei');
  const cohortHeld = nonNegativeWei(input.cohortUnconvertedGuaranteesWei, 'cohortUnconvertedGuaranteesWei');
  const floor = nonNegativeWei(input.newMinimumWei, 'newMinimumWei');
  const olderStress = nonNegativeWei(input.uncoveredOlderStressWei, 'uncoveredOlderStressWei');
  const count = input.requestedAdmissions;
  if (!Number.isSafeInteger(count) || count < 1 || floor === 0n) {
    throw new Error('Requested admission count and minimum must be positive');
  }
  for (const flag of ['enabled','evidenceVerified','disjointLiabilitySourcesVerified','unresolvedRecoveryOffset'] as const) {
    if (typeof input[flag] !== 'boolean') throw new Error(`${flag}: boolean required`);
  }
  const now = exactTime(input.evaluatedAt,'evaluatedAt');
  const observed = exactTime(input.onchainObservedAt,'onchainObservedAt');
  const globalHeld = existing + holds + old + buffer; // X included in existing
  const cohortHeldTotal = committed + cohortHeld; // X included in committed
  const globalFree = sub(pool,globalHeld);
  const cohortFree = sub(cohortBudget,cohortHeldTotal);
  const available = globalFree <= cohortFree ? globalFree : cohortFree;
  const requested = BigInt(count)*floor;
  let status: string = 'SHADOW_FITS';
  if (!input.enabled) status='FEATURE_DISABLED';
  else if (!input.evidenceVerified) status='UNVERIFIED_EVIDENCE';
  else if (!input.disjointLiabilitySourcesVerified) status='UNVERIFIED_DISJOINT_SOURCES';
  else if (now < observed || now-observed>5*60*1000) status='STALE_POOL';
  else if (xHeldIncluded>existing || cohortXIncluded>committed || holds<cohortHeld ||
    globalHeld>pool || cohortHeldTotal>cohortBudget) status='LEDGER_INCONSISTENT';
  else if (input.unresolvedRecoveryOffset) status='RECOVERY_OFFSET_UNRECONCILED';
  else if (olderStress>0n) status='LEGACY_STRESS_UNRESOLVED';
  else if (requested>available) status='INSUFFICIENT';
  // No shadow success grants a reward promise: an external VeChain payout can
  // race the observed balance, and DB serialization is still required.
  const inspectable = status==='SHADOW_FITS'||status==='INSUFFICIENT';
  return {
    status, authorizesAdmission:false as const, writesPerformed:false as const,
    xHeldAlreadyCountedWei:xHeldIncluded.toString(),
    xLifetimeAlreadyCountedWei:cohortXIncluded.toString(),
    globalTotalHeldWei:globalHeld.toString(),
    cohortTotalCommittedAndHeldWei:cohortHeldTotal.toString(),
    availableForNewPromisesWei:inspectable?available.toString():'0',
    seatsWithinShadow:inspectable?(available/floor).toString():'0',
    requestedWei:requested.toString(),
  };
}
