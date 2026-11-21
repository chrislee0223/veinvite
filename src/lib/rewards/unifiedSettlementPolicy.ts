/**
 * Unified round-close settlement arithmetic (v3, NOT wired to production).
 *
 * This module is pure, fail-closed and does not perform wallet/Sybil checks
 * itself. Callers MUST supply authoritative, transactionally locked evidence
 * for every candidate and all outstanding liabilities before persisting any
 * quote. No write path may use this until the v3 ledger/claim migration exists.
 *
 * All amounts are VeChain B3TR base units (18 decimals); never floating point.
 */
export const UNIFIED_SETTLEMENT_POLICY_VERSION = 'unified-round-close-v3-shadow';
export const B3TR_WEI = 1_000_000_000_000_000_000n;
export const X_PROMOTION_FIXED_WEI = 10n * B3TR_WEI;

export type UnifiedRewardCandidate = {
  inviteCode: string;
  completionFinalizedBeforeCutoff: boolean;
  sybilClearAtSettlement: boolean;
  walletRestrictionsClear: boolean;
  alreadyRewardedOrReserved: boolean;
};

export type UnifiedRewardSplit = {
  inviteCode: string;
  totalRewardWei: string;
  baseRewardWei: string;
  xPromotionHoldWei: string;
};

export type UnifiedRewardSettlement = {
  policyVersion: string;
  poolBalanceWei: string;
  outstandingLiabilityWei: string;
  availableWei: string;
  recipientCount: number;
  baseTotalWei: string;
  xPromotionHoldTotalWei: string;
  settledTotalWei: string;
  carryForwardWei: string;
  splits: UnifiedRewardSplit[];
};

function parseWei(value: string, field: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${field} must be a non-negative integer amount in wei`);
  }
  return BigInt(value);
}

/**
 * Settles only completed, finally-confirmed, currently Sybil-cleared referrals.
 * The liability input MUST already include every outstanding base/X obligation,
 * including previously closed rounds. Never subtract an X liability twice.
 *
 * No paid, signed, held, or unclaimed confirmed entitlement may be included
 * among candidates. Those are protected via outstandingLiabilityWei instead.
 * A zero-recipient round leaves all uncommitted funds for future rounds.
 */
export function calculateUnifiedRewardSettlement(input: {
  poolBalanceWei: string;
  outstandingLiabilityWei: string;
  candidates: readonly UnifiedRewardCandidate[];
}): UnifiedRewardSettlement {
  const poolBalance = parseWei(input.poolBalanceWei, 'poolBalanceWei');
  const outstanding = parseWei(input.outstandingLiabilityWei, 'outstandingLiabilityWei');

  // Inability to cover existing obligations is a hard stop, not 0-cost recovery.
  if (outstanding > poolBalance) {
    throw new Error('UNIFIED_SETTLEMENT_EXISTING_LIABILITIES_UNDERFUNDED');
  }
  if (!Array.isArray(input.candidates)) {
    throw new Error('UNIFIED_SETTLEMENT_CANDIDATES_INVALID');
  }

  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const candidate of input.candidates) {
    const code = candidate?.inviteCode;
    if (typeof code !== 'string' || !/^[A-HJ-NP-Z2-9]{7}$/.test(code)) {
      throw new Error('UNIFIED_SETTLEMENT_INVITE_CODE_INVALID');
    }
    if (seen.has(code)) {
      throw new Error('UNIFIED_SETTLEMENT_DUPLICATE_INVITE');
    }
    seen.add(code);
    if (
      candidate.completionFinalizedBeforeCutoff !== true ||
      candidate.sybilClearAtSettlement !== true ||
      candidate.walletRestrictionsClear !== true ||
      candidate.alreadyRewardedOrReserved !== false
    ) {
      // Don't silently discard a potentially owed reward or an unsafe wallet.
      throw new Error('UNIFIED_SETTLEMENT_CANDIDATE_NOT_ELIGIBLE');
    }
    recipients.push(code);
  }

  recipients.sort();
  const available = poolBalance - outstanding;
  if (recipients.length > 0 && available === 0n) {
    throw new Error('UNIFIED_SETTLEMENT_ZERO_AVAILABLE_FOR_RECIPIENTS');
  }

  const divisor = BigInt(recipients.length);
  const quotient = divisor === 0n ? 0n : available / divisor;
  const remainder = divisor === 0n ? 0n : available % divisor;

  let baseTotal = 0n;
  let xHoldTotal = 0n;
  const splits = recipients.map((inviteCode, index): UnifiedRewardSplit => {
    const total = quotient + (BigInt(index) < remainder ? 1n : 0n);
    if (total <= 0n) {
      throw new Error('UNIFIED_SETTLEMENT_ZERO_SHARE');
    }
    // 10 B3TR is included inside (never on top of) the user's total quote.
    // For a tiny total <= 10 B3TR pay everything as base and offer no X bonus.
    const xHold = total > X_PROMOTION_FIXED_WEI ? X_PROMOTION_FIXED_WEI : 0n;
    const base = total - xHold;
    baseTotal += base;
    xHoldTotal += xHold;
    return {
      inviteCode,
      totalRewardWei: total.toString(),
      baseRewardWei: base.toString(),
      xPromotionHoldWei: xHold.toString(),
    };
  });

  const settled = baseTotal + xHoldTotal;
  if (settled > available) {
    throw new Error('UNIFIED_SETTLEMENT_OVERCOMMITTED');
  }
  if (recipients.length > 0 && settled !== available) {
    throw new Error('UNIFIED_SETTLEMENT_UNALLOCATED_REMAINDER');
  }

  return {
    policyVersion: UNIFIED_SETTLEMENT_POLICY_VERSION,
    poolBalanceWei: poolBalance.toString(),
    outstandingLiabilityWei: outstanding.toString(),
    availableWei: available.toString(),
    recipientCount: recipients.length,
    baseTotalWei: baseTotal.toString(),
    xPromotionHoldTotalWei: xHoldTotal.toString(),
    settledTotalWei: settled.toString(),
    carryForwardWei: (available - settled).toString(),
    splits,
  };
}
