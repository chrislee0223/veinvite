/**
 * Read-only, offline shadow evaluation of alternate completion-time reward quotes.
 *
 * This module is intentionally NOT imported by reservation, forecast, payouts,
 * cron, or any production route. It cannot authorize or persist a reward.
 * Inputs must be aggregated from independently verified, immutable records.
 */
export type CohortOutcomeEvidence = {
  cohortRound: number;
  daysSinceEnd: number;
  activated: number;
  paidGross: number;
  paidInvalidated: number;
  blockedBeforePayment: number;
  stillActivating: number;
};

export type HistoricalRewardCalibration = {
  ready: boolean;
  reason: 'READY' | 'TOO_FEW_MATURE_COHORTS' | 'TOO_FEW_VERIFIED_PAYOUTS' | 'TOO_MANY_UNRESOLVED';
  matureCohorts: number;
  verifiedMaturePayouts: number;
  verifiedAllPayouts: number;
  invalidatedAllPayouts: number;
  unresolvedInMatureCohorts: number;
  matureActivated: number;
  matureP90VerifiedRecipients: number | null;
};

const DEFAULT_MIN_MATURE_COHORTS = 8;
const DEFAULT_MIN_VERIFIED_PAYOUTS = 35;
const DEFAULT_MATURE_DAYS = 21;
const MAX_UNRESOLVED_BPS = 2_000;

function count(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(field + ' must be a non-negative safe integer');
  }
  return value;
}

function wei(value: string, field: string): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(field + ' must be an exact non-negative decimal wei string');
  }
  return BigInt(value);
}

export function calibrateHistoricalRewardCohorts(
  cohorts: CohortOutcomeEvidence[],
  maturityDays = DEFAULT_MATURE_DAYS,
): HistoricalRewardCalibration {
  count(maturityDays, 'maturityDays');
  const unique = new Set<number>();
  let verifiedAll = 0;
  let invalidatedAll = 0;
  let matureCount = 0;
  let matureVerified = 0;
  let matureUnresolved = 0;
  let matureActivated = 0;
  const matureRecipientCounts: number[] = [];

  for (const row of cohorts) {
    const id = count(row.cohortRound, 'cohortRound');
    if (id < 1 || unique.has(id)) throw new Error('duplicate or invalid cohort');
    unique.add(id);
    const elapsed = count(row.daysSinceEnd, 'daysSinceEnd');
    const activated = count(row.activated, 'activated');
    const gross = count(row.paidGross, 'paidGross');
    const invalidated = count(row.paidInvalidated, 'paidInvalidated');
    const blocked = count(row.blockedBeforePayment, 'blockedBeforePayment');
    const active = count(row.stillActivating, 'stillActivating');
    if (invalidated > gross || gross + blocked + active > activated) {
      throw new Error('cohort statuses or invalidations are inconsistent');
    }
    const verified = gross - invalidated;
    verifiedAll += verified;
    invalidatedAll += invalidated;
    if (elapsed >= maturityDays) {
      matureCount += 1;
      matureVerified += verified;
      matureUnresolved += active;
      matureActivated += activated;
      matureRecipientCounts.push(verified);
    }
  }
  const unresolvedBps = matureActivated > 0
    ? Math.ceil(matureUnresolved * 10_000 / matureActivated)
    : 10_000;
  const ready =
    matureCount >= DEFAULT_MIN_MATURE_COHORTS &&
    matureVerified >= DEFAULT_MIN_VERIFIED_PAYOUTS &&
    unresolvedBps <= MAX_UNRESOLVED_BPS;
  const reason = matureCount < DEFAULT_MIN_MATURE_COHORTS
    ? 'TOO_FEW_MATURE_COHORTS'
    : matureVerified < DEFAULT_MIN_VERIFIED_PAYOUTS
      ? 'TOO_FEW_VERIFIED_PAYOUTS'
      : unresolvedBps > MAX_UNRESOLVED_BPS
        ? 'TOO_MANY_UNRESOLVED'
        : 'READY';
  // With few cohorts, using an empirical upper percentile would overfit
  // fraud-contaminated or incomplete cohorts. Do not emit a proposed divisor.
  const sorted = matureRecipientCounts.sort((a, b) => a - b);
  const p90 = ready
    ? sorted[Math.ceil(sorted.length * 0.9) - 1]
    : null;
  return {
    ready, reason, matureCohorts: matureCount,
    verifiedMaturePayouts: matureVerified,
    verifiedAllPayouts: verifiedAll,
    invalidatedAllPayouts: invalidatedAll,
    unresolvedInMatureCohorts: matureUnresolved,
    matureActivated,
    matureP90VerifiedRecipients: p90,
  };
}

export type ShadowRewardComparison = {
  status: 'EVIDENCE_NOT_READY' | 'SHADOW_ONLY';
  baselineStressRecipients: number;
  proposedStressRecipients: number | null;
  baselineQuoteWei: string;
  proposedQuoteWei: string | null;
  pricingCapacityWei: string;
  // This is not a promise about late reopened/future unobserved referrals.
  scenarioProtectedRecipients: number | null;
};

export function compareConservativeRewardShadow(input: {
  calibration: HistoricalRewardCalibration;
  baselineStressRecipients: number;
  // From an immutable quote snapshot for a SPECIFIC bound cohort, includes
  // the current candidate. Never infer from page visits, pending links or votes.
  knownOutstanding: number;
  // An independently verified upper bound, NOT inferred from current visitors.
  additionalPotentialEntrants: number;
  availableCohortWei: string;
  physicallyAvailableWei: string;
}): ShadowRewardComparison {
  const originalStress = count(input.baselineStressRecipients, 'baselineStressRecipients');
  const outstanding = count(input.knownOutstanding, 'knownOutstanding');
  const entrants = count(input.additionalPotentialEntrants, 'additionalPotentialEntrants');
  if (originalStress < 1 || outstanding < 1) throw new Error('invalid reservation cohort');
  const cohort = wei(input.availableCohortWei, 'availableCohortWei');
  const physical = wei(input.physicallyAvailableWei, 'physicallyAvailableWei');
  const capacity = cohort < physical ? cohort : physical;
  const baseline = capacity / BigInt(originalStress);
  const base = {
    baselineStressRecipients: originalStress,
    baselineQuoteWei: baseline.toString(),
    pricingCapacityWei: capacity.toString(),
  };
  if (!input.calibration.ready || input.calibration.matureP90VerifiedRecipients === null) {
    return {
      ...base, status: 'EVIDENCE_NOT_READY',
      proposedStressRecipients: null,
      proposedQuoteWei: null,
      scenarioProtectedRecipients: null,
    };
  }
  const protectedCount = outstanding + entrants;
  if (!Number.isSafeInteger(protectedCount)) throw new Error('recipient count overflow');
  // All known still-eligible wallets + independently bounded future entrants
  // must be covered, even if most are unlikely to complete. The extra +1
  // below hedges late reinstatement and historical tail risk.
  const candidateStress = Math.max(
    4,
    protectedCount + 1,
    input.calibration.matureP90VerifiedRecipients + 2,
  );
  // Historical calibration is diagnostic only. Never take a less conservative
  // denominator until separately reviewed as a payout policy change.
  const proposed = capacity / BigInt(candidateStress);
  return {
    ...base, status: 'SHADOW_ONLY',
    proposedStressRecipients: candidateStress,
    proposedQuoteWei: proposed.toString(),
    scenarioProtectedRecipients: protectedCount,
  };
}
