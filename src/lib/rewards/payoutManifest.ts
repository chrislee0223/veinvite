import { createHash } from 'node:crypto';

import { Interface } from 'ethers';

import { VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const HEX_DATA_PATTERN = /^0x[0-9a-f]+$/;
const INTEGER_PATTERN = /^\d+$/;

export const PAYOUT_MANIFEST_VERSION =
  'veinvite-payout-manifest-v1';

const rewardsPoolInterface = new Interface([
  'function distributeReward(bytes32 appId,uint256 amount,address receiver,string proof)',
]);

export type RewardRoundForManifest = {
  id: string | number;
  network: string;
  app_id: string;
  status: string;
  distributable_wei: string | number;
  eligible_count: string | number;
};

export type RewardPayoutForManifest = {
  id: string | number;
  invite_code: string;
  recipient_wallet: string;
  amount_wei: string | number;
  status: string;
  tx_id?: string | null;
};

export type PayoutManifestClause = {
  payoutId: string;
  inviteCode: string;
  recipientWallet: string;
  amountWei: string;
  to: string;
  value: '0x0';
  data: string;
};

export type PayoutManifest = {
  version: typeof PAYOUT_MANIFEST_VERSION;
  network: string;
  roundId: string;
  appId: string;
  x2EarnRewardsPoolAddress: string;
  payoutCount: number;
  totalAmountWei: string;
  clauses: PayoutManifestClause[];
  manifestHash: string;
};

function normalizePositiveInteger(
  value: string | number,
  fieldName: string,
): string {
  const normalized = String(value);

  if (
    !INTEGER_PATTERN.test(normalized) ||
    BigInt(normalized) < 1n
  ) {
    throw new Error(
      `${fieldName} must be a positive integer.`,
    );
  }

  return BigInt(normalized).toString();
}

function normalizeNonNegativeInteger(
  value: string | number,
  fieldName: string,
): string {
  const normalized = String(value);

  if (!INTEGER_PATTERN.test(normalized)) {
    throw new Error(
      `${fieldName} must be a non-negative integer.`,
    );
  }

  return BigInt(normalized).toString();
}

function normalizeAddress(
  value: string,
  fieldName: string,
): string {
  const normalized = value.trim().toLowerCase();

  if (!ADDRESS_PATTERN.test(normalized)) {
    throw new Error(
      `${fieldName} is not a valid VeChain address.`,
    );
  }

  return normalized;
}

function normalizeAppId(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(
      'Reward round app_id is not a valid bytes32 value.',
    );
  }

  if (normalized !== VEINVITE_APP_ID) {
    throw new Error(
      'Reward payout manifest can only target the VeInvite app.',
    );
  }

  return normalized;
}

function readEligibleCount(
  value: string | number,
): number {
  const normalized = normalizeNonNegativeInteger(
    value,
    'eligible_count',
  );
  const count = Number(normalized);

  if (!Number.isSafeInteger(count)) {
    throw new Error(
      'eligible_count exceeds the safe integer range.',
    );
  }

  return count;
}

function compareIntegerStrings(
  left: string,
  right: string,
): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);

  if (leftValue < rightValue) {
    return -1;
  }

  if (leftValue > rightValue) {
    return 1;
  }

  return 0;
}

function canonicalFinancialPayload(
  manifest: Omit<PayoutManifest, 'manifestHash'>,
) {
  return {
    version: manifest.version,
    network: manifest.network,
    roundId: manifest.roundId,
    appId: manifest.appId,
    x2EarnRewardsPoolAddress:
      manifest.x2EarnRewardsPoolAddress,
    payoutCount: manifest.payoutCount,
    totalAmountWei: manifest.totalAmountWei,
    clauses: manifest.clauses,
  };
}

function hashManifest(
  manifest: Omit<PayoutManifest, 'manifestHash'>,
): string {
  const serialized = JSON.stringify(
    canonicalFinancialPayload(manifest),
  );

  return `0x${createHash('sha256')
    .update(serialized)
    .digest('hex')}`;
}

export function buildPayoutManifest({
  round,
  payouts,
  x2EarnRewardsPoolAddress,
}: {
  round: RewardRoundForManifest;
  payouts: RewardPayoutForManifest[];
  x2EarnRewardsPoolAddress: string;
}): PayoutManifest {
  if (round.status !== 'CREATED') {
    throw new Error(
      'Reward round must be CREATED before manifest generation.',
    );
  }

  const roundId = normalizePositiveInteger(
    round.id,
    'round id',
  );
  const appId = normalizeAppId(round.app_id);
  const eligibleCount = readEligibleCount(
    round.eligible_count,
  );
  const distributableWei =
    normalizeNonNegativeInteger(
      round.distributable_wei,
      'distributable_wei',
    );
  const poolAddress = normalizeAddress(
    x2EarnRewardsPoolAddress,
    'X2EarnRewardsPool address',
  );

  if (eligibleCount < 1) {
    throw new Error(
      'Reward round has no eligible payouts.',
    );
  }

  if (payouts.length !== eligibleCount) {
    throw new Error(
      'Reward payout count does not match reward round eligible_count.',
    );
  }

  const normalizedPayouts = payouts.map((payout) => {
    const id = normalizePositiveInteger(
      payout.id,
      'payout id',
    );
    const amountWei = normalizePositiveInteger(
      payout.amount_wei,
      'payout amount_wei',
    );
    const recipientWallet = normalizeAddress(
      payout.recipient_wallet,
      'payout recipient_wallet',
    );
    const inviteCode = payout.invite_code.trim();

    if (!inviteCode) {
      throw new Error(
        'Reward payout invite_code is empty.',
      );
    }

    if (payout.status !== 'PENDING') {
      throw new Error(
        `Reward payout ${id} is not PENDING.`,
      );
    }

    if (payout.tx_id) {
      throw new Error(
        `Reward payout ${id} already has a tx_id.`,
      );
    }

    return {
      id,
      amountWei,
      recipientWallet,
      inviteCode,
    };
  });

  normalizedPayouts.sort((left, right) =>
    compareIntegerStrings(left.id, right.id),
  );

  const seenIds = new Set<string>();
  const seenInviteCodes = new Set<string>();
  let totalAmount = 0n;

  const clauses = normalizedPayouts.map((payout) => {
    if (seenIds.has(payout.id)) {
      throw new Error(
        `Duplicate reward payout id ${payout.id}.`,
      );
    }

    const inviteKey = payout.inviteCode.toLowerCase();

    if (seenInviteCodes.has(inviteKey)) {
      throw new Error(
        `Duplicate reward payout invite ${payout.inviteCode}.`,
      );
    }

    seenIds.add(payout.id);
    seenInviteCodes.add(inviteKey);
    totalAmount += BigInt(payout.amountWei);

    const data = rewardsPoolInterface
      .encodeFunctionData(
        'distributeReward',
        [
          appId,
          payout.amountWei,
          payout.recipientWallet,
          '',
        ],
      )
      .toLowerCase();

    if (!HEX_DATA_PATTERN.test(data)) {
      throw new Error(
        `Encoded payout clause ${payout.id} is invalid.`,
      );
    }

    return {
      payoutId: payout.id,
      inviteCode: payout.inviteCode,
      recipientWallet:
        payout.recipientWallet,
      amountWei: payout.amountWei,
      to: poolAddress,
      value: '0x0' as const,
      data,
    };
  });

  const totalAmountWei = totalAmount.toString();

  if (totalAmountWei !== distributableWei) {
    throw new Error(
      'Reward payout total does not match reward round distributable_wei.',
    );
  }

  const manifestWithoutHash = {
    version: PAYOUT_MANIFEST_VERSION,
    network: round.network,
    roundId,
    appId,
    x2EarnRewardsPoolAddress:
      poolAddress,
    payoutCount: clauses.length,
    totalAmountWei,
    clauses,
  } as const;

  return {
    ...manifestWithoutHash,
    manifestHash:
      hashManifest(manifestWithoutHash),
  };
}

export function decodePayoutClause(
  data: string,
) {
  const decoded =
    rewardsPoolInterface.decodeFunctionData(
      'distributeReward',
      data,
    );

  return {
    appId: String(decoded[0]).toLowerCase(),
    amountWei: BigInt(decoded[1]).toString(),
    recipientWallet:
      String(decoded[2]).toLowerCase(),
    proof: String(decoded[3]),
  };
}
