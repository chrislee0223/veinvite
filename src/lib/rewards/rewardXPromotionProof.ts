const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const VEINVITE_X_PROMOTION_PROOF_DESCRIPTION =
  'VeInvite verified X promotion reward.';
export const VEINVITE_X_PROMOTION_PROOF_ORIGIN =
  'https://veinvite.vercel.app';

export function normalizeRewardXPromotionPublicProofId(
  value: string,
): string {
  const normalized = value.trim().toLowerCase();

  if (!UUID_V4_PATTERN.test(normalized)) {
    throw new Error(
      'X promotion public Proof ID is invalid.',
    );
  }

  return normalized;
}

export function buildRewardXPromotionProof(
  publicProofId: string,
) {
  const normalized =
    normalizeRewardXPromotionPublicProofId(
      publicProofId,
    );

  return {
    publicProofId: normalized,
    proof:
      `veinvite:x-promotion:v1:proof:${normalized}`,
    url:
      `${VEINVITE_X_PROMOTION_PROOF_ORIGIN}/proofs/x/${normalized}`,
    description:
      VEINVITE_X_PROMOTION_PROOF_DESCRIPTION,
  } as const;
}
