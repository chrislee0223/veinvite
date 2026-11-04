/**
 * v3 X hold decision helper. This is deliberately PURE and inactive.
 * All timestamps/proof booleans must come from verified durable server/DB
 * records; callers must recheck Sybil and signed payout state transactionally.
 */
import { B3TR_WEI, X_PROMOTION_FIXED_WEI } from './unifiedSettlementPolicy.ts';

export const X_POST_WINDOW_MS = 24 * 60 * 60 * 1000;
export const X_RETAIN_WINDOW_MS = 24 * 60 * 60 * 1000;
export const X_SUBMISSION_GRACE_MS = 15 * 60 * 1000;

export type UnifiedXHoldDecision =
  | { action: 'NOT_OFFERED'; holdWei: '0'; reason: 'REWARD_NOT_ABOVE_TEN' }
  | { action: 'HOLD'; holdWei: string; reason: string }
  | { action: 'RELEASE'; holdWei: string; reason: string }
  | { action: 'READY_TO_SIGN'; holdWei: string; reason: 'FINAL_24H_PROOF_CLEAR' }
  | { action: 'SIGNED_PENDING_RECONCILIATION'; holdWei: string; reason: 'ALREADY_SIGNED' }
  | { action: 'PAID'; holdWei: string; reason: 'ONCHAIN_SETTLED' };

export type UnifiedXHoldInput = {
  totalRewardWei: string;
  nowMs: number;
  offerOpenedAtMs: number | null;
  postCreatedAtMs: number | null;
  submittedAtMs: number | null;
  initialVerifiedAtMs: number | null;
  finalVerifiedAtMs: number | null;
  pendingVerification: boolean;
  initialProofValid: boolean;
  finalProofValid: boolean;
  sybilStillClear: boolean;
  securityInvalidated: boolean;
  transferSigned: boolean;
  transferPaidOnchain: boolean;
};

function validMillis(v: number, key: string): number {
  if (!Number.isSafeInteger(v) || v < 0) {
    throw new Error(`UNIFIED_X_${key}_INVALID`);
  }
  return v;
}
function validOptionalMillis(v: number | null, key: string): number | null {
  return v === null ? null : validMillis(v, key);
}

export function decideUnifiedXHold(input: UnifiedXHoldInput): UnifiedXHoldDecision {
  if (!/^(0|[1-9][0-9]*)$/.test(input.totalRewardWei)) {
    throw new Error('UNIFIED_X_TOTAL_WEI_INVALID');
  }
  const total = BigInt(input.totalRewardWei);
  if (total <= 0n) throw new Error('UNIFIED_X_ZERO_TOTAL_REWARD');
  validMillis(input.nowMs, 'CURRENT_TIME');
  const opened = validOptionalMillis(input.offerOpenedAtMs, 'OFFER_OPENED_AT');
  const posted = validOptionalMillis(input.postCreatedAtMs, 'POST_CREATED_AT');
  const submitted = validOptionalMillis(input.submittedAtMs, 'SUBMITTED_AT');
  const initial = validOptionalMillis(input.initialVerifiedAtMs, 'INITIAL_VERIFIED_AT');
  const final = validOptionalMillis(input.finalVerifiedAtMs, 'FINAL_VERIFIED_AT');

  // No possible X offer for a small fixed total.
  if (total <= X_PROMOTION_FIXED_WEI) {
    if (input.transferSigned || input.transferPaidOnchain || opened !== null ||
        posted !== null || submitted !== null || initial !== null || final !== null) {
      throw new Error('UNIFIED_X_SMALL_REWARD_UNEXPECTED_PROMOTION_HISTORY');
    }
    return { action: 'NOT_OFFERED', holdWei: '0', reason: 'REWARD_NOT_ABOVE_TEN' };
  }

  const holdWei = (10n * B3TR_WEI).toString();
  if (input.transferPaidOnchain && !input.transferSigned) {
    throw new Error('UNIFIED_X_PAID_WITHOUT_SIGNED_EVIDENCE');
  }
  // Signed on-chain transactions cannot be "unpromised" even if a later
  // external or Sybil check fails. Reconcile the signed transaction first.
  if (input.transferPaidOnchain) {
    return { action: 'PAID', holdWei, reason: 'ONCHAIN_SETTLED' };
  }
  if (input.transferSigned) {
    return { action: 'SIGNED_PENDING_RECONCILIATION', holdWei, reason: 'ALREADY_SIGNED' };
  }

  if (!input.sybilStillClear || input.securityInvalidated) {
    return { action: 'RELEASE', holdWei, reason: 'SECURITY_INVALIDATED_BEFORE_SIGNING' };
  }
  if (opened === null) {
    if (posted !== null || submitted !== null || initial !== null || final !== null) {
      throw new Error('UNIFIED_X_PROOF_BEFORE_OFFER');
    }
    // Offer begins only after eligible base payment, not round settlement.
    return { action: 'HOLD', holdWei, reason: 'BASE_PAYOUT_NOT_READY' };
  }
  if (opened > input.nowMs) throw new Error('UNIFIED_X_OFFER_IN_FUTURE');
  const deadline = opened + X_POST_WINDOW_MS;
  const graceDeadline = deadline + X_SUBMISSION_GRACE_MS;

  if (posted !== null && (posted < opened || posted > deadline)) {
    return { action: 'RELEASE', holdWei, reason: 'POST_OUTSIDE_24H_WINDOW' };
  }
  if (submitted !== null && (submitted < opened || submitted > graceDeadline)) {
    return { action: 'RELEASE', holdWei, reason: 'SUBMISSION_OUTSIDE_GRACE_WINDOW' };
  }
  if (initial !== null && (posted === null || submitted === null ||
      initial < posted || initial < submitted)) {
    throw new Error('UNIFIED_X_INITIAL_PROOF_TIMELINE_INVALID');
  }
  if (final !== null && initial === null) {
    throw new Error('UNIFIED_X_FINAL_WITHOUT_INITIAL_PROOF');
  }

  if (final !== null) {
    if (!input.finalProofValid || !input.initialProofValid) {
      return { action: 'RELEASE', holdWei, reason: 'FINAL_POST_PROOF_INVALID' };
    }
    if (final < initial! + X_RETAIN_WINDOW_MS ||
        final > input.nowMs) {
      throw new Error('UNIFIED_X_FINAL_24H_RETENTION_NOT_PROVEN');
    }
    return { action: 'READY_TO_SIGN', holdWei, reason: 'FINAL_24H_PROOF_CLEAR' };
  }

  if (initial !== null) {
    if (!input.initialProofValid) {
      return { action: 'RELEASE', holdWei, reason: 'INITIAL_POST_PROOF_INVALID' };
    }
    // A verified eligible post stays HELD pending the 24-hour retention proof;
    // a slow final check must not let an expiry sweep steal the hold.
    return { action: 'HOLD', holdWei, reason:
      input.nowMs < initial + X_RETAIN_WINDOW_MS
        ? 'WAITING_24H_RETENTION' : 'WAITING_FINAL_POST_RECHECK' };
  }

  if (input.pendingVerification && submitted !== null) {
    // Scans can finish after 24h+15m if submission was made in time.
    return { action: 'HOLD', holdWei, reason: 'PENDING_INITIAL_POST_VERIFICATION' };
  }
  if (input.nowMs > graceDeadline) {
    return { action: 'RELEASE', holdWei, reason: 'NO_VERIFIED_POST_BEFORE_DEADLINE' };
  }
  return { action: 'HOLD', holdWei, reason: 'OFFER_STILL_OPEN_OR_IN_GRACE' };
}
