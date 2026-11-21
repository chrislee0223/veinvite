/**
 * Advisory-only simulation for a fully audited, separately approved B3TR
 * boost release. NEVER use this output as payout authority or a public quote:
 * the authoritative reservation RPC must first atomically allocate funding.
 *
 * All Wei values are integer strings to prevent token rounding/overflow.
 */
export type AdaptiveBoostShadowInput = {
  currentlyDesignatedWei: string;
  officialAllocationWei: string;
  bankBalanceWei: string;
  bankStressReserveWei: string;
  physicalExtraHeadroomWei: string;
  currentStressRecipients: number;
};

export type AdaptiveBoostShadowResult = {
  shadowOnly: true;
  requiresAuditedCohortRelease: true;
  protectedRecipients: number;
  candidateExtraReleaseWei: string;
  currentlyPayablePerInviteWei: string;
  simulatedAfterReleasePerInviteWei: string;
  bankLeftAfterCandidateWei: string;
};

const MIN_PROTECTED_RECIPIENTS = 4;
const EXTRA_ALLOCATION_CAP_BPS = 5_000n;
const BPS = 10_000n;

function wei(value: string, name: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(name + ' must be a non-negative integer Wei string.');
  }
  return BigInt(value);
}

function recipients(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('currentStressRecipients must be a non-negative safe integer.');
  }
  return BigInt(Math.max(MIN_PROTECTED_RECIPIENTS, value));
}

function lowest(...numbers: bigint[]): bigint {
  return numbers.reduce((min, value) => value < min ? value : min);
}

export function simulateAdaptiveRewardBoost(input: AdaptiveBoostShadowInput): AdaptiveBoostShadowResult {
  const capacity = wei(input.currentlyDesignatedWei, 'currentlyDesignatedWei');
  const official = wei(input.officialAllocationWei, 'officialAllocationWei');
  const bank = wei(input.bankBalanceWei, 'bankBalanceWei');
  const bankStressReserve = wei(input.bankStressReserveWei, 'bankStressReserveWei');
  const physicalHeadroom = wei(input.physicalExtraHeadroomWei, 'physicalExtraHeadroomWei');
  const protectedRecipients = recipients(input.currentStressRecipients);

  // No bank spending below the current stress reserve. The headroom input must
  // ALREADY be calculated by the authoritative DB planner after liabilities,
  // matured-source protection and recently funded cohorts.
  const bankAvailable = bank > bankStressReserve ? bank - bankStressReserve : 0n;
  const candidateExtra = lowest(
    bankAvailable,
    physicalHeadroom,
    official * EXTRA_ALLOCATION_CAP_BPS / BPS,
  );

  return {
    shadowOnly: true,
    requiresAuditedCohortRelease: true,
    protectedRecipients: Number(protectedRecipients),
    candidateExtraReleaseWei: candidateExtra.toString(),
    currentlyPayablePerInviteWei: (capacity / protectedRecipients).toString(),
    simulatedAfterReleasePerInviteWei: ((capacity + candidateExtra) / protectedRecipients).toString(),
    bankLeftAfterCandidateWei: (bank - candidateExtra).toString(),
  };
}
