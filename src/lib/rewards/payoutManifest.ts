import { createHash } from 'node:crypto';

import { Interface } from 'ethers';

import { VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const HEX_DATA_PATTERN = /^0x[0-9a-f]+$/;
const INTEGER_PATTERN = /^\d+$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const PAYOUT_MANIFEST_VERSION_V2 =
  'veinvite-payout-manifest-v2' as const;
export const PAYOUT_MANIFEST_VERSION_V3 =
  'veinvite-payout-manifest-v3' as const;
export const PAYOUT_MANIFEST_VERSION =
  PAYOUT_MANIFEST_VERSION_V3;

export type PayoutManifestVersion =
  | typeof PAYOUT_MANIFEST_VERSION_V2
  | typeof PAYOUT_MANIFEST_VERSION_V3;

export const VEINVITE_REWARD_PROOF_DESCRIPTION =
  'VeInvite verified referral onboarding reward.';
export const VEINVITE_REWARD_PROOF_ORIGIN =
  'https://veinvite.vercel.app';

const rewardsPoolInterface = new Interface([
  'function distributeReward(bytes32 appId,uint256 amount,address receiver,string proof)',
  'function distributeRewardWithProof(bytes32 appId,uint256 amount,address receiver,string[] proofTypes,string[] proofValues,string[] impactCodes,uint256[] impactValues,string description)',
]);

export type RewardRoundForManifest = {
  id: string | number;
  network: string;
  app_id: string;
  status: string;
  distributable_wei: string | number;
  eligible_count: string | number;
  manifest_version?: string | null;
};

export type RewardPayoutForManifest = {
  id: string | number;
  invite_code: string;
  recipient_wallet: string;
  amount_wei: string | number;
  status: string;
  tx_id?: string | null;
  public_proof_id?: string | null;
};

export type PayoutManifestClause = {
  payoutId: string;
  inviteCode: string;
  recipientWallet: string;
  amountWei: string;
  proof: string;
  publicProofId?: string;
  proofTypes?: string[];
  proofValues?: string[];
  impactCodes?: string[];
  impactValues?: string[];
  description?: string;
  to: string;
  value: '0x0';
  data: string;
};

export type PayoutManifest = {
  version: PayoutManifestVersion;
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

function normalizePublicProofId(
  value: string | null | undefined,
  fieldName: string,
): string {
  const normalized = value?.trim().toLowerCase() ?? '';

  if (!UUID_V4_PATTERN.test(normalized)) {
    throw new Error(
      `${fieldName} is not a valid public Proof ID.`,
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

function resolveManifestVersion(
  value: string | null | undefined,
): PayoutManifestVersion {
  const normalized = value?.trim();

  if (!normalized) {
    return PAYOUT_MANIFEST_VERSION_V3;
  }

  if (
    normalized === PAYOUT_MANIFEST_VERSION_V2 ||
    normalized === PAYOUT_MANIFEST_VERSION_V3
  ) {
    return normalized;
  }

  throw new Error(
    `Unsupported reward payout manifest version: ${normalized}`,
  );
}

function buildPayoutProof(
  payoutId: string,
  publicProofId: string | null,
  version: PayoutManifestVersion,
): string {
  if (version === PAYOUT_MANIFEST_VERSION_V2) {
    return `veinvite:referral-onboarding:v1:payout:${payoutId}`;
  }

  if (!publicProofId) {
    throw new Error(
      `Reward payout ${payoutId} is missing a public Proof ID.`,
    );
  }

  return `veinvite:referral-onboarding:v2:proof:${publicProofId}`;
}

function buildPublicProofUrl(
  publicProofId: string,
): string {
  return `${VEINVITE_REWARD_PROOF_ORIGIN}/proofs/${publicProofId}`;
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

  const manifestVersion = resolveManifestVersion(
    round.manifest_version,
  );
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
    const publicProofId =
      manifestVersion === PAYOUT_MANIFEST_VERSION_V3
        ? normalizePublicProofId(
            payout.public_proof_id,
            `payout ${id} public_proof_id`,
          )
        : null;

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
      publicProofId,
    };
  });

  normalizedPayouts.sort((left, right) =>
    compareIntegerStrings(left.id, right.id),
  );

  const seenIds = new Set<string>();
  const seenInviteCodes = new Set<string>();
  const seenPublicProofIds = new Set<string>();
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

    if (
      payout.publicProofId &&
      seenPublicProofIds.has(payout.publicProofId)
    ) {
      throw new Error(
        `Duplicate public Proof ID ${payout.publicProofId}.`,
      );
    }

    seenIds.add(payout.id);
    seenInviteCodes.add(inviteKey);
    if (payout.publicProofId) {
      seenPublicProofIds.add(payout.publicProofId);
    }
    totalAmount += BigInt(payout.amountWei);

    const proof = buildPayoutProof(
      payout.id,
      payout.publicProofId,
      manifestVersion,
    );

    if (manifestVersion === PAYOUT_MANIFEST_VERSION_V2) {
      const data = rewardsPoolInterface
        .encodeFunctionData(
          'distributeReward',
          [
            appId,
            payout.amountWei,
            payout.recipientWallet,
            proof,
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
        proof,
        to: poolAddress,
        value: '0x0' as const,
        data,
      };
    }

    if (!payout.publicProofId) {
      throw new Error(
        `Reward payout ${payout.id} is missing a public Proof ID.`,
      );
    }

    const proofTypes = ['text', 'link'];
    const proofValues = [
      proof,
      buildPublicProofUrl(payout.publicProofId),
    ];
    const impactCodes: string[] = [];
    const impactValues: string[] = [];
    const description =
      VEINVITE_REWARD_PROOF_DESCRIPTION;
    const data = rewardsPoolInterface
      .encodeFunctionData(
        'distributeRewardWithProof',
        [
          appId,
          payout.amountWei,
          payout.recipientWallet,
          proofTypes,
          proofValues,
          impactCodes,
          impactValues.map((value) => BigInt(value)),
          description,
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
      proof,
      publicProofId: payout.publicProofId,
      proofTypes,
      proofValues,
      impactCodes,
      impactValues,
      description,
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
    version: manifestVersion,
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
    clauses: [...clauses],
    manifestHash:
      hashManifest({
        ...manifestWithoutHash,
        clauses: [...clauses],
      }),
  };
}

export function decodePayoutClause(
  data: string,
) {
  const selector = data.slice(0, 10).toLowerCase();
  const legacyFunction = rewardsPoolInterface.getFunction(
    'distributeReward',
  );
  const proofFunction = rewardsPoolInterface.getFunction(
    'distributeRewardWithProof',
  );

  if (!legacyFunction || !proofFunction) {
    throw new Error('Reward payout ABI is unavailable.');
  }

  if (selector === legacyFunction.selector.toLowerCase()) {
    const decoded =
      rewardsPoolInterface.decodeFunctionData(
        legacyFunction,
        data,
      );

    return {
      version: PAYOUT_MANIFEST_VERSION_V2,
      appId: String(decoded[0]).toLowerCase(),
      amountWei: BigInt(decoded[1]).toString(),
      recipientWallet:
        String(decoded[2]).toLowerCase(),
      proof: String(decoded[3]),
    };
  }

  if (selector === proofFunction.selector.toLowerCase()) {
    const decoded =
      rewardsPoolInterface.decodeFunctionData(
        proofFunction,
        data,
      );
    const proofTypes = Array.from(
      decoded[3] as readonly string[],
      String,
    );
    const proofValues = Array.from(
      decoded[4] as readonly string[],
      String,
    );
    const impactCodes = Array.from(
      decoded[5] as readonly string[],
      String,
    );
    const impactValues = Array.from(
      decoded[6] as readonly bigint[],
      (value) => BigInt(value).toString(),
    );

    return {
      version: PAYOUT_MANIFEST_VERSION_V3,
      appId: String(decoded[0]).toLowerCase(),
      amountWei: BigInt(decoded[1]).toString(),
      recipientWallet:
        String(decoded[2]).toLowerCase(),
      proof: proofValues[0] ?? '',
      proofTypes,
      proofValues,
      impactCodes,
      impactValues,
      description: String(decoded[7]),
    };
  }

  throw new Error(
    'Payout clause does not target a supported rewards-pool function.',
  );
}
