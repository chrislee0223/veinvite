const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const VEINVITE_X_PROMOTION_PROOF_DESCRIPTION =
  'VeInvite verified X promotion reward.';
export const VEINVITE_X_PROMOTION_PROOF_TEXT_PREFIX =
  'veinvite:x-promotion:v1:proof:';
export const VEINVITE_X_PROMOTION_PROOF_ORIGIN =
  'https://veinvite.vercel.app';

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizePublicProofId(value: string): string {
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
    normalizePublicProofId(publicProofId);

  return {
    proofText:
      `${VEINVITE_X_PROMOTION_PROOF_TEXT_PREFIX}${normalized}`,
    proofLink:
      `${VEINVITE_X_PROMOTION_PROOF_ORIGIN}/proofs/x-promotion/${normalized}`,
    description:
      VEINVITE_X_PROMOTION_PROOF_DESCRIPTION,
  };
}

export function isVeInviteXPromotionStructuredProof(
  rawProof: string,
): boolean {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawProof);
  } catch {
    return false;
  }

  if (!isRecord(parsed)) {
    return false;
  }

  const proof = parsed.proof;

  if (
    parsed.version !== 2 ||
    parsed.description !==
      VEINVITE_X_PROMOTION_PROOF_DESCRIPTION ||
    !isRecord(proof) ||
    typeof proof.text !== 'string' ||
    typeof proof.link !== 'string' ||
    Object.prototype.hasOwnProperty.call(
      parsed,
      'impact',
    )
  ) {
    return false;
  }

  if (
    !proof.text.startsWith(
      VEINVITE_X_PROMOTION_PROOF_TEXT_PREFIX,
    )
  ) {
    return false;
  }

  const publicProofId = proof.text.slice(
    VEINVITE_X_PROMOTION_PROOF_TEXT_PREFIX.length,
  ).toLowerCase();

  if (!UUID_V4_PATTERN.test(publicProofId)) {
    return false;
  }

  const expected =
    buildRewardXPromotionProof(publicProofId);

  return (
    proof.text === expected.proofText &&
    proof.link === expected.proofLink
  );
}
