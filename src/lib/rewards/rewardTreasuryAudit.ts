/**
 * Pure audit against a CONSISTENT read-only DB snapshot.
 * Do not import from payout, claim or admission code. No public reward promises.
 * The source protections describe the sealed historical snapshot, not
 * a guarantee that every historical late recipient can be paid simultaneously.
 */
export type TreasurySourceProtection = {
  cohortRound: number;
  sealedIncompleteCount: number;
  currentNonblockedIncompleteCount: number;
  lateRewardWei: string;
  weightedLateProtectionWei: string;
  promotionProtectionWei: string;
  sweptWei: string;
};

export type TreasuryAuditInput = {
  sourceSweepsWei: string;
  boostReleasesWei: string;
  lateCompletionReleasesWei: string;
  recordedBankWei: string;
  recordedBankStressWei: string;
  recordedSourceRetainedWei: string;
  sourceOverrunCount: number;
  destinationOverrunCount: number;
  sourceProtections: TreasurySourceProtection[];
  currentAllocationWei: string;
  currentBoostWei: string;
  currentEffectiveBudgetWei: string;
  currentCommittedWei: string;
  physicalPoolWei: string;
  physicalPoolObservedAt: string;
  snapshotAsOf: string;
  assignedPaidPairedCount: number;
  assignedWithoutPaidCount: number;
  paidWithoutAssignedCount: number;
  outstandingQueueCount: number;
  outstandingPayoutCount: number;
};
const INT = /^(0|[1-9][0-9]*)$/;
function wei(value: string, field: string): bigint {
  if (typeof value !== 'string' || !INT.test(value)) throw new Error(`${field}: invalid wei`);
  return BigInt(value);
}
function count(value: number, field: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field}: invalid count`);
  return BigInt(value);
}
function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !/(Z|[+-]\d\d:\d\d)$/.test(value)) throw new Error(`${field}: invalid timestamp`);
  return parsed;
}
const max0 = (x: bigint) => x > 0n ? x : 0n;
export function auditRewardTreasury(x: TreasuryAuditInput) {
  const problems: string[] = [];
  const alerts: string[] = [];
  const inflow = wei(x.sourceSweepsWei, 'sourceSweeps');
  const boost = wei(x.boostReleasesWei, 'boostReleases');
  const late = wei(x.lateCompletionReleasesWei, 'lateReleases');
  const bank = wei(x.recordedBankWei, 'recordedBank');
  const bankStress = wei(x.recordedBankStressWei, 'bankStress');
  const retained = wei(x.recordedSourceRetainedWei, 'sourceRetained');
  const cohortAllocation = wei(x.currentAllocationWei, 'currentAllocation');
  const cohortBoost = wei(x.currentBoostWei, 'currentBoost');
  const cohortEffective = wei(x.currentEffectiveBudgetWei, 'currentEffective');
  const cohortCommitted = wei(x.currentCommittedWei, 'currentCommitted');
  const pool = wei(x.physicalPoolWei, 'physicalPool');
  const snapshotTime = timestamp(x.snapshotAsOf, 'snapshotAsOf');
  const poolTime = timestamp(x.physicalPoolObservedAt, 'physicalPoolObservedAt');
  const paired = count(x.assignedPaidPairedCount, 'paired');
  const unmatchedAssigned = count(x.assignedWithoutPaidCount, 'unmatchedAssigned');
  const unmatchedPaid = count(x.paidWithoutAssignedCount, 'unmatchedPaid');
  const queued = count(x.outstandingQueueCount, 'queued');
  const payouts = count(x.outstandingPayoutCount, 'outstandingPayouts');
  const overrun = count(x.sourceOverrunCount, 'sourceOverrun') + count(x.destinationOverrunCount, 'destinationOverrun');

  const bankCalculated = inflow - boost - late;
  if (bankCalculated !== bank) problems.push('RESERVE_LEDGER_NOT_CONSERVED');
  if (bankCalculated < 0n) problems.push('NEGATIVE_RESERVE_LEDGER');
  if (bank < bankStress) problems.push('STRESS_BANK_UNDERFUNDED');
  if (overrun > 0n) problems.push('BOOST_SOURCE_OR_DESTINATION_OVERRUN');
  if (cohortEffective !== cohortAllocation + cohortBoost) problems.push('CURRENT_COHORT_FUNDING_MISMATCH');
  if (cohortCommitted > cohortEffective) problems.push('COHORT_COMMITMENT_OVER_BUDGET');
  // Lifetime PAID entries may have left the pool; do not compare lifetime
  // cohort commitments with the current physical balance directly.
  if (unmatchedAssigned > 0n) problems.push('ASSIGNED_QUEUE_WITHOUT_PAID_RECORD');
  if (unmatchedPaid > 0n) problems.push('PAID_RECORD_WITHOUT_ASSIGNED_QUEUE');
  if (queued > 0n || payouts > 0n) alerts.push('PENDING_UNPAID_ITEMS_REQUIRE_SEPARATE_LEDGER_AUDIT');
  if (snapshotTime - poolTime > 15 * 60 * 1000 || poolTime > snapshotTime + 60 * 1000) {
    alerts.push('POOL_OBSERVATION_STALE_OR_FUTURE');
  }

  let sumLate = 0n;
  let sumPromo = 0n;
  let allLateCompleteStress = 0n;
  let perCohortUncoveredStress = 0n;
  let currentLongIncomplete = 0n;
  let historicalSnapshotCount = 0n;
  const cohortDetails = [];
  const cohorts = new Set<number>();
  for (const p of x.sourceProtections) {
    if (!Number.isSafeInteger(p.cohortRound) || p.cohortRound < 1 || cohorts.has(p.cohortRound)) {
      throw new Error('Invalid or duplicate protected cohort');
    }
    cohorts.add(p.cohortRound);
    const sealedN = count(p.sealedIncompleteCount, 'sealedIncompleteCount');
    const liveN = count(p.currentNonblockedIncompleteCount, 'currentNonblockedIncompleteCount');
    const rate = wei(p.lateRewardWei, 'lateReward');
    const protectedLate = wei(p.weightedLateProtectionWei, 'weightedLate');
    const protectedPromo = wei(p.promotionProtectionWei, 'promotionProtection');
    wei(p.sweptWei, 'swept');
    if (sealedN !== liveN) alerts.push(`LATE_PARTICIPANT_CENSUS_DRIFT:${p.cohortRound}`);
    sumLate += protectedLate;
    sumPromo += protectedPromo;
    // Worst case only, NOT existing fixed liabilities.
    const demand = liveN * rate;
    allLateCompleteStress += demand;
    // Cohort protections are ring-fenced: surplus in one old cohort is
    // not assumed transferable to cover another cohort's late claim.
    perCohortUncoveredStress += max0(demand - protectedLate);
    currentLongIncomplete += liveN;
    historicalSnapshotCount += sealedN;
    cohortDetails.push({
      cohortRound: p.cohortRound,
      unfinished: liveN.toString(),
      allCompleteDemandWei: demand.toString(),
      weightedProtectionWei: protectedLate.toString(),
      hypotheticalGapWei: max0(demand - protectedLate).toString(),
    });
  }
  if (sumLate + sumPromo !== retained) problems.push('SOURCE_RETAINED_LEDGER_MISMATCH');
  const riskGap = max0(perCohortUncoveredStress - bankStress);
  if (riskGap > 0n) alerts.push('HISTORICAL_ALL_COMPLETE_STRESS_EXCEEDS_WEIGHTED_PROTECTION');
  if (paired === 0n && (unmatchedAssigned > 0n || unmatchedPaid > 0n)) alerts.push('PAYOUT_PAIRING_ABSENT');

  return {
    version: 'reward-treasury-reconciliation-v1',
    writesPerformed: false as const,
    status: problems.length ? 'FAILED_RECONCILIATION' as const : alerts.length ? 'CONSERVED_WITH_STRESS_ALERTS' as const : 'CONSERVED' as const,
    problems,
    alerts,
    snapshotAsOf: x.snapshotAsOf,
    physicalPoolObservedAt: x.physicalPoolObservedAt,
    historicalProtection: {
      sourceRetainedWei: retained.toString(),
      weightedLateWei: sumLate.toString(),
      promotionReserveWei: sumPromo.toString(),
      bankStressWei: bankStress.toString(),
      currentNonblockedIncompleteCount: currentLongIncomplete.toString(),
      sealedIncompleteCount: historicalSnapshotCount.toString(),
      hypotheticalAllLateCompleteDemandWei: allLateCompleteStress.toString(),
      hypotheticalGapBeyondWeightedPlusBankStressWei: riskGap.toString(),
      // Sum individual cohort shortfalls before deducting the shared bank.
      // Excess weighted protection in another cohort cannot hide a deficit.
      perCohortUncoveredStressWei: perCohortUncoveredStress.toString(),
      note: 'Hypothetical stress gap, NOT a confirmed deficit or payable balance. Other pool funds and recovery logic may change outcomes.',
      perCohort: cohortDetails,
    },
    reserve: {
      sourceSweepsWei: inflow.toString(),
      boostReleasesWei: boost.toString(),
      lateReleasesWei: late.toString(),
      bankCalculatedWei: bankCalculated.toString(),
      bankRecordedWei: bank.toString(),
      ordinarilyReleasableBankWei: max0(bank - bankStress).toString(),
    },
    currentCohort: {
      effectiveBudgetWei: cohortEffective.toString(),
      committedWei: cohortCommitted.toString(),
      uncommittedWei: max0(cohortEffective - cohortCommitted).toString(),
      note: 'Uncommitted is NOT unencumbered or available to a single user.',
    },
  };
}
