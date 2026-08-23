export type RewardPayoutStatus =
  | 'PENDING'
  | 'SENDING'
  | 'PAID'
  | 'FAILED';

export interface RewardCandidate {
  inviteCode: string;
  recipientWallet: string;
  eligibleAt: string | null;
}

export interface ExistingRewardPayout {
  inviteCode: string;
  amountWei: string;
  status: RewardPayoutStatus;
}

export interface RewardDryRunPayout {
  inviteCode: string;
  recipientWallet: string;
  amountWei: string;
}

export interface RewardDryRunResult {
  observedPoolBalanceWei: string;
  reservedExistingWei: string;
  availableToReserveWei: string;
  eligibleCount: number;
  perRewardWei: string;
  distributableWei: string;
  remainderWei: string;
  payouts: RewardDryRunPayout[];
}

const WALLET_PATTERN = /^0x[0-9a-f]{40}$/;
const INTEGER_PATTERN = /^\d+$/;
const PAYOUT_STATUSES = new Set<RewardPayoutStatus>([
  'PENDING',
  'SENDING',
  'PAID',
  'FAILED',
]);

function parseWei(
  value: string,
  fieldName: string,
): bigint {
  if (!INTEGER_PATTERN.test(value)) {
    throw new Error(
      `${fieldName} must be a non-negative integer string.`,
    );
  }

  return BigInt(value);
}

function normalizeInviteCode(
  value: string,
  fieldName: string,
): string {
  const inviteCode =
    value.trim().toUpperCase();

  if (!inviteCode) {
    throw new Error(
      `${fieldName} cannot be empty.`,
    );
  }

  return inviteCode;
}

function normalizeCandidate(
  candidate: RewardCandidate,
): RewardCandidate {
  const inviteCode = normalizeInviteCode(
    candidate.inviteCode,
    'Reward candidate inviteCode',
  );

  const recipientWallet =
    candidate.recipientWallet.toLowerCase();

  if (!WALLET_PATTERN.test(recipientWallet)) {
    throw new Error(
      `Invalid reward recipient wallet for invite ${inviteCode}.`,
    );
  }

  if (!candidate.eligibleAt) {
    throw new Error(
      `Reward candidate ${inviteCode} is missing reward_eligible_at.`,
    );
  }

  const eligibleAt =
    candidate.eligibleAt.trim();
  const eligibleAtMs =
    Date.parse(eligibleAt);

  if (
    !eligibleAt ||
    Number.isNaN(eligibleAtMs)
  ) {
    throw new Error(
      `Reward candidate ${inviteCode} has an invalid reward_eligible_at.`,
    );
  }

  return {
    inviteCode,
    recipientWallet,
    eligibleAt,
  };
}

/**
 * Pure, read-only reward preview.
 *
 * Important policy assumptions:
 * - `poolBalanceWei` is the on-chain Rewards Distribution Pool balance only.
 * - Operations funds stay outside the Rewards Distribution Pool.
 * - Existing PENDING/SENDING/FAILED payouts remain reserved.
 * - An invitation with any prior payout record is never included again.
 * - Every candidate in a round receives exactly the same integer amount.
 * - Any indivisible remainder stays in the pool for a future round.
 * - Malformed accounting data fails closed instead of being silently ignored.
 */
export function calculateRewardDryRun(input: {
  poolBalanceWei: string;
  candidates: RewardCandidate[];
  existingPayouts: ExistingRewardPayout[];
}): RewardDryRunResult {
  const observedPoolBalance = parseWei(
    input.poolBalanceWei,
    'poolBalanceWei',
  );

  const existingInviteCodes =
    new Set<string>();
  let reservedExisting = 0n;

  for (const payout of input.existingPayouts) {
    const inviteCode = normalizeInviteCode(
      payout.inviteCode,
      'Existing payout inviteCode',
    );

    if (existingInviteCodes.has(inviteCode)) {
      throw new Error(
        `Duplicate existing payout for invite ${inviteCode}.`,
      );
    }

    existingInviteCodes.add(inviteCode);

    if (!PAYOUT_STATUSES.has(payout.status)) {
      throw new Error(
        `Invalid payout status for invite ${inviteCode}.`,
      );
    }

    const amountWei = parseWei(
      payout.amountWei,
      `amountWei for ${inviteCode}`,
    );

    if (amountWei < 1n) {
      throw new Error(
        `Existing payout ${inviteCode} must have a positive amount.`,
      );
    }

    if (
      payout.status === 'PENDING' ||
      payout.status === 'SENDING' ||
      payout.status === 'FAILED'
    ) {
      reservedExisting += amountWei;
    }
  }

  const availableToReserve =
    observedPoolBalance > reservedExisting
      ? observedPoolBalance - reservedExisting
      : 0n;

  const seenCandidates =
    new Set<string>();
  const eligibleCandidates:
    RewardCandidate[] = [];

  for (const rawCandidate of input.candidates) {
    const inviteCode = normalizeInviteCode(
      rawCandidate.inviteCode,
      'Reward candidate inviteCode',
    );

    if (seenCandidates.has(inviteCode)) {
      throw new Error(
        `Duplicate reward candidate invite ${inviteCode}.`,
      );
    }

    seenCandidates.add(inviteCode);

    if (existingInviteCodes.has(inviteCode)) {
      continue;
    }

    eligibleCandidates.push(
      normalizeCandidate({
        ...rawCandidate,
        inviteCode,
      }),
    );
  }

  eligibleCandidates.sort((a, b) => {
    const aTime = Date.parse(
      a.eligibleAt as string,
    );
    const bTime = Date.parse(
      b.eligibleAt as string,
    );

    if (aTime !== bTime) {
      return aTime - bTime;
    }

    return a.inviteCode.localeCompare(
      b.inviteCode,
    );
  });

  const eligibleCount =
    eligibleCandidates.length;

  if (
    eligibleCount === 0 ||
    availableToReserve === 0n
  ) {
    return {
      observedPoolBalanceWei:
        observedPoolBalance.toString(),
      reservedExistingWei:
        reservedExisting.toString(),
      availableToReserveWei:
        availableToReserve.toString(),
      eligibleCount,
      perRewardWei: '0',
      distributableWei: '0',
      remainderWei:
        availableToReserve.toString(),
      payouts: [],
    };
  }

  const perReward =
    availableToReserve /
    BigInt(eligibleCount);

  if (perReward < 1n) {
    return {
      observedPoolBalanceWei:
        observedPoolBalance.toString(),
      reservedExistingWei:
        reservedExisting.toString(),
      availableToReserveWei:
        availableToReserve.toString(),
      eligibleCount,
      perRewardWei: '0',
      distributableWei: '0',
      remainderWei:
        availableToReserve.toString(),
      payouts: [],
    };
  }

  const distributable =
    perReward * BigInt(eligibleCount);
  const remainder =
    availableToReserve - distributable;

  return {
    observedPoolBalanceWei:
      observedPoolBalance.toString(),
    reservedExistingWei:
      reservedExisting.toString(),
    availableToReserveWei:
      availableToReserve.toString(),
    eligibleCount,
    perRewardWei: perReward.toString(),
    distributableWei:
      distributable.toString(),
    remainderWei: remainder.toString(),
    payouts: eligibleCandidates.map(
      (candidate) => ({
        inviteCode: candidate.inviteCode,
        recipientWallet:
          candidate.recipientWallet,
        amountWei: perReward.toString(),
      }),
    ),
  };
}
