/**
 * A strictly non-authorizing preflight for a FUTURE atomic admission writer.
 * The estimate is NOT a guarantee: only a committed, funded SQL HELD row
 * written under the canonical payout lock could create a promise.
 *
 * No token transfers, database writes, or client-visible offers are made here.
 */
const WEI = /^(0|[1-9]\d*)$/;
function exactWei(raw: string, key: string): bigint {
  if (typeof raw !== 'string' || !WEI.test(raw)) {
    throw new Error('Invalid exact Wei for admission preflight: ' + key);
  }
  return BigInt(raw);
}
export type AdmissionPreflight = {
  invitationStatus: 'PENDING_ACCEPTANCE' | 'ACTIVATING' | 'UNDER_REVIEW' | 'COMPLETED' | 'CANCELLED';
  sybilStatus: 'NOT_CHECKED' | 'CLEAR' | 'HOLD' | 'BLOCKED';
  rewardCohortRoundId: string | null;
  allocationReceiptId: string | null;
  existingAdmissionHold: boolean;
  canonicalFixedRewardExists: boolean;
  onchainAvailablePoolWei: string;
  physicalLiabilityIncludingHeldWei: string;
  cohortBudgetWei: string;
  cohortCommittedIncludingHeldWei: string;
  stressReserveWei: string;
  configuredMinimumWei: string;
  distributionPaused: boolean;
};
export function evaluateAdmissionPreflight(v: AdmissionPreflight) {
  const pool = exactWei(v.onchainAvailablePoolWei, 'onchainAvailablePoolWei');
  const physical = exactWei(v.physicalLiabilityIncludingHeldWei, 'physicalLiabilityIncludingHeldWei');
  const budget = exactWei(v.cohortBudgetWei, 'cohortBudgetWei');
  const committed = exactWei(v.cohortCommittedIncludingHeldWei, 'cohortCommittedIncludingHeldWei');
  const stress = exactWei(v.stressReserveWei, 'stressReserveWei');
  const minimum = exactWei(v.configuredMinimumWei, 'configuredMinimumWei');
  if (typeof v.existingAdmissionHold !== 'boolean' ||
      typeof v.canonicalFixedRewardExists !== 'boolean' ||
      typeof v.distributionPaused !== 'boolean') {
    throw new Error('Invalid admission financial state');
  }
  const reasons: string[] = [];
  const eligibleState = v.invitationStatus === 'ACTIVATING' ||
    v.invitationStatus === 'UNDER_REVIEW';
  if (!eligibleState) reasons.push('NOT_ACTIVE_BOUND_INVITATION');
  if (!v.rewardCohortRoundId || !/^[1-9]\d*$/.test(v.rewardCohortRoundId) ||
      !v.allocationReceiptId || !/^[1-9]\d*$/.test(v.allocationReceiptId)) {
    reasons.push('OFFICIAL_COHORT_RECEIPT_NOT_BOUND');
  }
  if (v.sybilStatus === 'BLOCKED' || v.sybilStatus === 'HOLD') {
    reasons.push('SYBIL_RESTRICTION');
  } else if (v.sybilStatus !== 'CLEAR' && v.sybilStatus !== 'NOT_CHECKED') {
    throw new Error('Unrecognized Sybil status');
  }
  if (v.existingAdmissionHold || v.canonicalFixedRewardExists) {
    reasons.push('EXISTING_REWARD_OBLIGATION');
  }
  if (v.distributionPaused) reasons.push('DISTRIBUTION_PAUSED');
  if (minimum === 0n) reasons.push('GUARANTEE_MINIMUM_NOT_CONFIGURED');

  // Conservative headroom; HELD is counted in canonical liability once.
  // The stress reserve is deducted from physical headroom, not cohort headroom.
  const poolHeadroom = pool > physical + stress ? pool - physical - stress : 0n;
  const cohortHeadroom = budget > committed ? budget - committed : 0n;
  const maximum = poolHeadroom < cohortHeadroom ? poolHeadroom : cohortHeadroom;
  if (minimum > maximum) reasons.push('INSUFFICIENT_DOUBLE_CAPPED_FUNDING');
  if (physical > pool) reasons.push('POOL_ALREADY_UNDERFUNDED');
  if (committed > budget) reasons.push('COHORT_ALREADY_OVERCOMMITTED');
  return {
    decision: reasons.length === 0 ? 'PRECHECK_ONLY' as const : 'BLOCKED' as const,
    reasons,
    physicalHeadroomWei: poolHeadroom.toString(),
    cohortHeadroomWei: cohortHeadroom.toString(),
    conservativeMaximumWei: maximum.toString(),
    configuredMinimumWei: minimum.toString(),
    // A successful preflight is NOT an admission or an offer.
    canPromiseToInvitee: false as const,
    canWriteAdmissionHold: false as const,
    canSignOrPay: false as const,
    financialWritesPerformed: false as const,
  };
}
