/**
 * Preview-only, opt-in comparison between the staged admission funding
 * reader and the canonical referral reservation quote.
 *
 * This helper does not reserve, release, authorize or pay anything.
 * Production and the dedicated read-only QA Studio cannot opt in.
 */
export type AdmissionShadowEnvironment = {
  VERCEL_ENV?: string;
  VEINVITE_QA_STUDIO?: string;
  VEINVITE_ADMISSION_SHADOW_READ_ENABLED?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

const PREVIEW_DB_URL = 'https://bpppslplhmppxzvdkwxs.supabase.co';
const EXACT_WEI = /^(0|[1-9]\d*)$/;

export function shouldReadRewardAdmissionShadow(
  network: string,
  env: AdmissionShadowEnvironment,
): boolean {
  return network === 'testnet'
    && env.VERCEL_ENV === 'preview'
    && env.VEINVITE_QA_STUDIO !== 'true'
    && env.VEINVITE_ADMISSION_SHADOW_READ_ENABLED === 'true'
    && env.NEXT_PUBLIC_SUPABASE_URL === PREVIEW_DB_URL;
}

export type AdmissionShadowSnapshot = {
  status: string;
  originalOutstandingWei: string;
  cohortLifetimeIncludingUnconvertedWei: string;
};

export type AdmissionShadowExpected = {
  reservedExistingWei: string;
  cohortReservedWei: string;
};

export function compareRewardAdmissionShadow(
  snapshot: AdmissionShadowSnapshot,
  expected: AdmissionShadowExpected,
): { status: 'MATCH' | 'DRIFT' | 'OVERCOMMITTED'; mismatches: string[] } {
  for (const [label, value] of [
    ['originalOutstandingWei', snapshot.originalOutstandingWei],
    ['cohortLifetimeIncludingUnconvertedWei', snapshot.cohortLifetimeIncludingUnconvertedWei],
    ['reservedExistingWei', expected.reservedExistingWei],
    ['cohortReservedWei', expected.cohortReservedWei],
  ] as const) {
    if (!EXACT_WEI.test(value)) {
      throw new Error('Invalid exact Wei in admission shadow comparison: ' + label);
    }
  }
  if (snapshot.status === 'COHORT_OVERCOMMITTED') {
    return { status: 'OVERCOMMITTED', mismatches: ['cohortBudget'] };
  }
  if (snapshot.status !== 'STAGING_DISABLED') {
    throw new Error('Reward admission shadow is not hard-disabled');
  }

  const mismatches: string[] = [];
  if (BigInt(snapshot.originalOutstandingWei) !== BigInt(expected.reservedExistingWei)) {
    mismatches.push('globalOutstanding');
  }
  if (
    BigInt(snapshot.cohortLifetimeIncludingUnconvertedWei)
    !== BigInt(expected.cohortReservedWei)
  ) {
    mismatches.push('cohortLifetime');
  }
  return {
    status: mismatches.length > 0 ? 'DRIFT' : 'MATCH',
    mismatches,
  };
}
