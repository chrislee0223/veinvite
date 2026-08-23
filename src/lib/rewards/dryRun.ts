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

function parseWei(value: string, fieldName: string): bigint {
  if (!INTEGER_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a non-negative integer string.`);
  }

  return BigInt(value);
}

function normalizeCandidate(candidate: RewardCandidate): RewardCandidate {
  const recipientWallet = candidate.recipientWallet.toLowerCase();

  if (!WALLET_PATTERN.test(recipientWallet)) {
    throw new Error(
      `Invalid reward recipient wallet for invite ${candidate.inviteCode}.`,
    );
  }

  if (!candidate.inviteCode.trim()) {
    throw new Error('Reward candidate inviteCode cannot be empty.');
  }

  return {
    ...candidate,
    inviteCode: candidate.inviteCode.trim().toUpperCase(),
    recipientWallet,
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

  const existingInviteCodes = new Set<string>();
  let reservedExisting = 0n;

  for (const payout of input.existingPayouts) {
    const inviteCode = payout.inviteCode.trim().toUpperCase();

    if (!inviteCode) {
      throw new Error('Existing payout inviteCode cannot be empty.');
    }

    existingInviteCodes.add(inviteCode);

    if (
      payout.status === 'PENDING' ||
      payout.status === 'SENDING' ||
      payout.status === 'FAILED'
    ) {
      reservedExisting += parseWei(
        payout.amountWei,
        `amountWei for ${inviteCode}`,
      );
    }
  }

  const availableToReserve =
    observedPoolBalance > reservedExisting
      ? observedPoolBalance - reservedExisting
      : 0n;

  const seenCandidates = new Set<string>();

  const eligibleCandidates = input.candidates
    .map(normalizeCandidate)
    .filter((candidate) => {
      if (existingInviteCodes.has(candidate.inviteCode)) {
        return false;
      }

      if (seenCandidates.has(candidate.inviteCode)) {
        throw new Error(
          `Duplicate reward candidate invite ${candidate.inviteCode}.`,
        );
      }

      seenCandidates.add(candidate.inviteCode);
      return true;
    })
    .sort((a, b) => {
      const aTime = a.eligibleAt
        ? Date.parse(a.eligibleAt)
        : Number.MAX_SAFE_INTEGER;
      const bTime = b.eligibleAt
        ? Date.parse(b.eligibleAt)
        : Number.MAX_SAFE_INTEGER;

      if (aTime !== bTime) {
        return aTime - bTime;
      }

      return a.inviteCode.localeCompare(b.inviteCode);
    });

  const eligibleCount = eligibleCandidates.length;

  if (eligibleCount === 0 || availableToReserve === 0n) {
    return {
      observedPoolBalanceWei: observedPoolBalance.toString(),
      reservedExistingWei: reservedExisting.toString(),
      availableToReserveWei: availableToReserve.toString(),
      eligibleCount,
      perRewardWei: '0',
      distributableWei: '0',
      remainderWei: availableToReserve.toString(),
      payouts: [],
    };
  }

  const perReward =
    availableToReserve / BigInt(eligibleCount);

  if (perReward < 1n) {
    return {
      observedPoolBalanceWei: observedPoolBalance.toString(),
      reservedExistingWei: reservedExisting.toString(),
      availableToReserveWei: availableToReserve.toString(),
      eligibleCount,
      perRewardWei: '0',
      distributableWei: '0',
      remainderWei: availableToReserve.toString(),
      payouts: [],
    };
  }

  const distributable =
    perReward * BigInt(eligibleCount);
  const remainder =
    availableToReserve - distributable;

  return {
    observedPoolBalanceWei: observedPoolBalance.toString(),
    reservedExistingWei: reservedExisting.toString(),
    availableToReserveWei: availableToReserve.toString(),
    eligibleCount,
    perRewardWei: perReward.toString(),
    distributableWei: distributable.toString(),
    remainderWei: remainder.toString(),
    payouts: eligibleCandidates.map((candidate) => ({
      inviteCode: candidate.inviteCode,
      recipientWallet: candidate.recipientWallet,
      amountWei: perReward.toString(),
    })),
  };
}
