import 'server-only';

import { createHash } from 'node:crypto';

import { Interface } from 'ethers';

export const X_PROMOTION_PAYOUT_MANIFEST_VERSION =
  'veinvite-x-promotion-payout-manifest-v1' as const;
export const X_PROMOTION_PROOF_DESCRIPTION =
  'VeInvite verified X promotion bonus.';
export const X_PROMOTION_PROOF_ORIGIN =
  'https://veinvite.vercel.app/promotion-proofs';
export const X_PROMOTION_VEINVITE_APP_ID =
  '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/u;
const APP_ID_PATTERN = /^0x[0-9a-f]{64}$/u;
const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/u;
const INTEGER_PATTERN = /^\d+$/u;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HEX_DATA_PATTERN = /^0x[0-9a-f]+$/u;

const rewardsPoolInterface = new Interface([
  'function distributeRewardWithProof(bytes32 appId,uint256 amount,address receiver,string[] proofTypes,string[] proofValues,string[] impactCodes,uint256[] impactValues,string description)',
]);

export type XPromotionPayoutManifestInput = {
  intentId: string | number;
  network: 'mainnet' | 'testnet' | 'testnet-staging';
  appId: string;
  x2EarnRewardsPoolAddress: string;
  operatorWallet: string;
  inviteCode: string;
  recipientWallet: string;
  amountWei: string | number;
  publicProofId: string;
};

export type XPromotionPayoutClause = {
  intentId: string;
  inviteCode: string;
  recipientWallet: string;
  amountWei: string;
  publicProofId: string;
  proof: string;
  proofTypes: ['text', 'link'];
  proofValues: [string, string];
  impactCodes: [];
  impactValues: [];
  description: string;
  appId: string;
  to: string;
  value: '0x0';
  data: string;
};

export type XPromotionPayoutManifest = {
  version: typeof X_PROMOTION_PAYOUT_MANIFEST_VERSION;
  network: XPromotionPayoutManifestInput['network'];
  intentId: string;
  appId: string;
  x2EarnRewardsPoolAddress: string;
  operatorWallet: string;
  inviteCode: string;
  recipientWallet: string;
  amountWei: string;
  publicProofId: string;
  proofText: string;
  proofLink: string;
  description: string;
  clause: XPromotionPayoutClause;
  manifestHash: string;
};

function positiveInteger(
  value: string | number,
  fieldName: string,
): string {
  const normalized = String(value);

  if (
    !INTEGER_PATTERN.test(normalized) ||
    BigInt(normalized) < 1n
  ) {
    throw new Error(
      `X promotion ${fieldName} must be a positive integer.`,
    );
  }

  return BigInt(normalized).toString();
}

function address(
  value: string,
  fieldName: string,
): string {
  const normalized =
    value.trim().toLowerCase();

  if (!ADDRESS_PATTERN.test(normalized)) {
    throw new Error(
      `X promotion ${fieldName} is invalid.`,
    );
  }

  return normalized;
}

function appId(value: string): string {
  const normalized =
    value.trim().toLowerCase();

  if (
    !APP_ID_PATTERN.test(normalized) ||
    normalized !== X_PROMOTION_VEINVITE_APP_ID
  ) {
    throw new Error(
      'X promotion manifest can only target the VeInvite app.',
    );
  }

  return normalized;
}

function inviteCode(value: string): string {
  const normalized =
    value.trim().toUpperCase();

  if (!INVITE_CODE_PATTERN.test(normalized)) {
    throw new Error(
      'X promotion invite code is invalid.',
    );
  }

  return normalized;
}

function publicProofId(value: string): string {
  const normalized =
    value.trim().toLowerCase();

  if (!UUID_V4_PATTERN.test(normalized)) {
    throw new Error(
      'X promotion public Proof ID is invalid.',
    );
  }

  return normalized;
}

function hashManifest(
  manifest: Omit<XPromotionPayoutManifest, 'manifestHash'>,
): string {
  const serialized = JSON.stringify({
    version: manifest.version,
    network: manifest.network,
    intentId: manifest.intentId,
    appId: manifest.appId,
    x2EarnRewardsPoolAddress:
      manifest.x2EarnRewardsPoolAddress,
    operatorWallet:
      manifest.operatorWallet,
    inviteCode: manifest.inviteCode,
    recipientWallet:
      manifest.recipientWallet,
    amountWei: manifest.amountWei,
    publicProofId: manifest.publicProofId,
    proofText: manifest.proofText,
    proofLink: manifest.proofLink,
    description: manifest.description,
    clause: manifest.clause,
  });

  return `0x${createHash('sha256')
    .update(serialized)
    .digest('hex')}`;
}

export function buildXPromotionPayoutManifest(
  input: XPromotionPayoutManifestInput,
): XPromotionPayoutManifest {
  const normalizedIntentId =
    positiveInteger(
      input.intentId,
      'intent id',
    );
  const normalizedAppId =
    appId(input.appId);
  const normalizedPool =
    address(
      input.x2EarnRewardsPoolAddress,
      'Rewards Pool address',
    );
  const normalizedOperator =
    address(
      input.operatorWallet,
      'operator wallet',
    );
  const normalizedInvite =
    inviteCode(input.inviteCode);
  const normalizedRecipient =
    address(
      input.recipientWallet,
      'recipient wallet',
    );
  const normalizedAmount =
    positiveInteger(
      input.amountWei,
      'amount',
    );
  const normalizedProofId =
    publicProofId(input.publicProofId);
  const proofText =
    `veinvite:x-promotion:v1:proof:${normalizedProofId}`;
  const proofLink =
    `${X_PROMOTION_PROOF_ORIGIN}/${normalizedProofId}`;
  const proofTypes =
    ['text', 'link'] as const;
  const proofValues =
    [proofText, proofLink] as const;
  const impactCodes: [] = [];
  const impactValues: [] = [];

  const data = rewardsPoolInterface
    .encodeFunctionData(
      'distributeRewardWithProof',
      [
        normalizedAppId,
        normalizedAmount,
        normalizedRecipient,
        proofTypes,
        proofValues,
        impactCodes,
        impactValues,
        X_PROMOTION_PROOF_DESCRIPTION,
      ],
    )
    .toLowerCase();

  if (!HEX_DATA_PATTERN.test(data)) {
    throw new Error(
      'X promotion payout clause encoding is invalid.',
    );
  }

  const clause: XPromotionPayoutClause = {
    intentId: normalizedIntentId,
    inviteCode: normalizedInvite,
    recipientWallet:
      normalizedRecipient,
    amountWei: normalizedAmount,
    publicProofId:
      normalizedProofId,
    proof: proofText,
    proofTypes: ['text', 'link'],
    proofValues: [proofText, proofLink],
    impactCodes,
    impactValues,
    description:
      X_PROMOTION_PROOF_DESCRIPTION,
    appId: normalizedAppId,
    to: normalizedPool,
    value: '0x0',
    data,
  };

  const manifestWithoutHash = {
    version:
      X_PROMOTION_PAYOUT_MANIFEST_VERSION,
    network: input.network,
    intentId: normalizedIntentId,
    appId: normalizedAppId,
    x2EarnRewardsPoolAddress:
      normalizedPool,
    operatorWallet:
      normalizedOperator,
    inviteCode: normalizedInvite,
    recipientWallet:
      normalizedRecipient,
    amountWei: normalizedAmount,
    publicProofId:
      normalizedProofId,
    proofText,
    proofLink,
    description:
      X_PROMOTION_PROOF_DESCRIPTION,
    clause,
  } as const;

  return {
    ...manifestWithoutHash,
    manifestHash:
      hashManifest(manifestWithoutHash),
  };
}
