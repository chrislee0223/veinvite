/**
 * Isolated Phase 9: reconcile a proposed *gross* guaranteed referral award
 * with actual *net* B3TR payable after trusted fraud-recovery offsets.
 *
 * READ-ONLY MODEL. This is never payment authority, and must not be imported
 * from a live Claim, reservation, signer, X or admission route.
 * The caller must not count X twice: existing unpaid already includes LIVE X.
 * Gross cohort lifetime includes PAID commitments and recovery offsets.
 */
export type GrossNetHandoffPreviewInput = {
  guaranteeGrossWei: string;
  finalGrossQuoteWei: string;
  verifiedRecoveryOffsetWei: string;
  physicalPoolWei: string;
  existingUnpaidBaseAndXWei: string;
  globalUnconvertedGuaranteesWei: string;
  olderProtectionOutsideExistingWei: string;
  safetyBufferWei: string;
  cohortEffectiveBudgetWei: string;
  cohortLifetimeCommittedGrossWei: string;
  cohortUnconvertedGuaranteesWei: string;
  observedAt: string;
  evaluatedAt: string;
  immutableReceiptAndInviteMatched: boolean;
  missionFinalized: boolean;
  sybilClear: boolean;
  recoveryLedgerFullyVerified: boolean;
  physicalPoolEvidenceVerified: boolean;
  disjointSourcesVerified: boolean;
  olderStressResolved: boolean;
  alreadyFixedOrSettled: boolean;
};

const CANON = /^(0|[1-9]\d*)$/;
function wei(x: unknown, field: string): bigint {
  if (typeof x !== 'string' || !CANON.test(x)) throw new Error(field + ': invalid exact Wei');
  return BigInt(x);
}
function flag(x: unknown, field: string): boolean {
  if (typeof x !== 'boolean') throw new Error(field + ': boolean required');
  return x;
}
function instant(x: unknown, field: string): number {
  if (typeof x !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(x)) {
    throw new Error(field + ': timezone required');
  }
  const parsed = Date.parse(x);
  if (!Number.isFinite(parsed)) throw new Error(field + ': invalid time');
  return parsed;
}

/**
 * The preview is deliberately non-authoritative even when status=SIMULATION_FITS.
 * Production needs one globally serialized DB writer shared by the base payout,
 * X promotion, recovery, boost/rollover, and a verified chain balance custody
 * policy; release of a guarantee requires an immutable canonical settlement.
 */
export function previewGrossNetHandoff(x: GrossNetHandoffPreviewInput) {
  const floor = wei(x.guaranteeGrossWei,'guaranteeGrossWei');
  const gross = wei(x.finalGrossQuoteWei,'finalGrossQuoteWei');
  const offset = wei(x.verifiedRecoveryOffsetWei,'verifiedRecoveryOffsetWei');
  const physical = wei(x.physicalPoolWei,'physicalPoolWei');
  const unpaid = wei(x.existingUnpaidBaseAndXWei,'existingUnpaidBaseAndXWei');
  const held = wei(x.globalUnconvertedGuaranteesWei,'globalUnconvertedGuaranteesWei');
  const older = wei(x.olderProtectionOutsideExistingWei,'olderProtectionOutsideExistingWei');
  const buffer = wei(x.safetyBufferWei,'safetyBufferWei');
  const budget = wei(x.cohortEffectiveBudgetWei,'cohortEffectiveBudgetWei');
  const committedGross = wei(x.cohortLifetimeCommittedGrossWei,'cohortLifetimeCommittedGrossWei');
  const cohortHeld = wei(x.cohortUnconvertedGuaranteesWei,'cohortUnconvertedGuaranteesWei');
  const observed = instant(x.observedAt,'observedAt');
  const now = instant(x.evaluatedAt,'evaluatedAt');
  const sameReceipt = flag(x.immutableReceiptAndInviteMatched,'immutableReceiptAndInviteMatched');
  const missionFinalized = flag(x.missionFinalized,'missionFinalized');
  const sybilClear = flag(x.sybilClear,'sybilClear');
  const recoveryVerified = flag(x.recoveryLedgerFullyVerified,'recoveryLedgerFullyVerified');
  const balanceVerified = flag(x.physicalPoolEvidenceVerified,'physicalPoolEvidenceVerified');
  const disjoint = flag(x.disjointSourcesVerified,'disjointSourcesVerified');
  const olderResolved = flag(x.olderStressResolved,'olderStressResolved');
  const alreadyFixed = flag(x.alreadyFixedOrSettled,'alreadyFixedOrSettled');

  if (floor === 0n || gross === 0n || floor > held || floor > cohortHeld) {
    throw new Error('Invalid or unbacked gross guarantee');
  }
  const grossBefore = committedGross + cohortHeld;
  const physicalBefore = unpaid + held + older + buffer;
  let status: string = 'SIMULATION_FITS';
  if (alreadyFixed) status = 'ALREADY_FIXED_OR_SETTLED';
  else if (!sameReceipt) status = 'RECEIPT_OR_INVITE_MISMATCH';
  else if (!missionFinalized || !sybilClear) status = 'MISSION_OR_SYBIL_UNRESOLVED';
  else if (!recoveryVerified) status = 'RECOVERY_AUTHORITY_UNVERIFIED';
  else if (!balanceVerified || !disjoint) status = 'POOL_OR_LIABILITY_UNVERIFIED';
  else if (now < observed || now - observed > 5 * 60_000) status = 'STALE_CHAIN_OBSERVATION';
  else if (!olderResolved) status = 'OLDER_COMPLETION_STRESS_UNRESOLVED';
  else if (gross < floor) status = 'QUOTE_BELOW_PROMISED_GROSS';
  else if (offset > gross) status = 'RECOVERY_OFFSET_OVER_GROSS';
  else if (physicalBefore > physical || grossBefore > budget) status = 'BASELINE_LEDGER_INCONSISTENT';

  // Actual on-chain outgoing B3TR is the net quote. The cohort consumes the
  // full gross quote including a properly verified recovery offset.
  const net = gross >= offset ? gross - offset : 0n;
  const physicalAfter = physicalBefore - floor + net;
  const grossAfter = grossBefore - floor + gross;
  if (status === 'SIMULATION_FITS' && (physicalAfter > physical || grossAfter > budget)) {
    status = 'HANDOFF_UNDERFUNDED';
  }
  const inspectable = status === 'SIMULATION_FITS';
  return {
    modelVersion: 'gross-net-handoff-shadow-v1' as const,
    status,
    authorizesAdmission: false as const,
    authorizesHandoff: false as const,
    authorizesPayout: false as const,
    writesPerformed: false as const,
    simulatedNetPayableWei: inspectable ? net.toString() : null,
    simulatedRecoveryOffsetWei: inspectable ? offset.toString() : null,
    globalPhysicalLiabilityBeforeWei: physicalBefore.toString(),
    globalPhysicalLiabilityAfterWei: inspectable ? physicalAfter.toString() : null,
    cohortLifetimeEncumberedBeforeWei: grossBefore.toString(),
    cohortLifetimeEncumberedAfterWei: inspectable ? grossAfter.toString() : null,
    simulatedPhysicalLiabilityDeltaWei: inspectable ? (net - floor).toString() : null,
    simulatedCohortLifetimeDeltaWei: inspectable ? (gross - floor).toString() : null,
    prerequisite: 'ATOMIC_CROSS_WRITER_DB_HANDOFF_AND_CANONICAL_CHAIN_FINALITY' as const,
  };
}
