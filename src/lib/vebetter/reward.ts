export const REWARD_POOL_PERCENT = 80;
export const TREASURY_POOL_PERCENT = 20;

export interface WeeklySettlementInput {
  distributableB3tr: bigint;
  verifiedReferralCodes: string[];
}

export interface ReferralSettlement {
  referralCode: string;
  amount: bigint;
}

/** Equal proportional MVP settlement. A future version may add transparent weighting. */
export function calculateWeeklySettlement(
  input: WeeklySettlementInput,
): ReferralSettlement[] {
  if (input.verifiedReferralCodes.length === 0) return [];

  const count = BigInt(input.verifiedReferralCodes.length);
  const base = input.distributableB3tr / count;
  let remainder = input.distributableB3tr % count;

  return input.verifiedReferralCodes.map((referralCode) => {
    const bonus = remainder > 0n ? 1n : 0n;
    if (remainder > 0n) remainder -= 1n;
    return { referralCode, amount: base + bonus };
  });
}
