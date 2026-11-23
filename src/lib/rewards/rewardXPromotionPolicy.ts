/**
 * Display-only X promotion policy verification.
 *
 * Production payment authority stays in immutable SQL split rows and payout
 * triggers. Do not use this helper to decide how much to pay on-chain.
 */
export const X_PROMOTION_ADDITIVE_POLICY = 'x-promotion-additive-v2';
export const X_PROMOTION_WITHHELD_POLICY = 'x-promotion-withheld-10pct-v3';
export const X_PROMOTION_FIXED_BONUS_WEI = 10_000_000_000_000_000_000n;

export type XPromotionRewardType = 'ADDITIVE' | 'WITHHELD';

function exactIntegerWei(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/u.test(value)) {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function validateDisplayXPromotionSplit(input: {
  policyVersion: string;
  grossWei: string | null;
  baseWei: string | null;
  promotionWei: string | null;
}): XPromotionRewardType | null {
  const gross = exactIntegerWei(input.grossWei);
  const base = exactIntegerWei(input.baseWei);
  const promotion = exactIntegerWei(input.promotionWei);
  if (gross === null || gross <= 0n ||
      base === null || base <= 0n || promotion === null) {
    return null;
  }

  if (input.policyVersion === X_PROMOTION_ADDITIVE_POLICY) {
    return base === gross && promotion === X_PROMOTION_FIXED_BONUS_WEI
      ? 'ADDITIVE'
      : null;
  }

  if (input.policyVersion === X_PROMOTION_WITHHELD_POLICY) {
    return base + promotion === gross && promotion === gross / 10n
      ? 'WITHHELD'
      : null;
  }

  return null;
}
