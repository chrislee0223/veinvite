/**
 * Independent preview-only STOPGAP before financial event promotion.
 *
 * Return value never authorizes a payout. It requires a freshly recomputed
 * review that still matches the immutable staged candidate, a separate
 * trusted chain source fingerprint, and a durable event-time invite record.
 *
 * Existing VeBetterDAO RuleBook may forbid vote/other-app reward layering.
 * Until official rulebook clearance, all categories remain POLICY_HOLD.
 */
import {
  checkMultilevelReviewFreshness,
  type NonpayableMultilevelReview,
} from './multilevelReviewFreshness.ts';

export type PromotionPreflightInput = {
  network:'testnet'|'testnet-staging';
  roundId:number;
  wallet:string;
  /** From private candidate_chain_observations, NOT a browser argument. */
  stagedChainFingerprint:string;
  /** Freshly recomputed by a trusted Thor reader. */
  rescannedChainFingerprint:string;
  originalReview:NonpayableMultilevelReview;
  /** Re-evaluated from authoritative Sybil + historical graph providers. */
  currentReview:NonpayableMultilevelReview;
  /** Proof that onchain data comes from an independently verified provider. */
  canonicalChainAuthorityChecked:boolean;
  /** Actual trust checked, not self-attested 'active=true' flags. */
  canonicalSybilAndIdentityChecked:boolean;
  /** Historical referral chain, including inactive/reparented paths. */
  canonicalInviteGraphChecked:boolean;
  /** Real participant pool reserve, not hypothetical estimated B3TR. */
  independentFundingReconciled:boolean;
  /** Formal VeBetterDAO RuleBook compliance review. */
  officialRulebookClearanceVerified:boolean;
};

export type PromotionPreflightResult = {
  status:'BLOCKED'|'REQUIRES_OPERATOR_REVIEW';
  payable:false;
  roundId:number;
  reasons:string[];
  /**
   * Even REQUIRES_OPERATOR_REVIEW is NOT evidence of payment approval:
   * the production promotion function has intentionally not been created.
   */
  nextAction:'REVERIFY_SOURCE'|'RESOLVE_RULEBOOK_AND_FUNDING'|
    'MANUAL_SECURITY_SIGNOFF';
};

const FINGERPRINT=/^[0-9a-f]{64}$/;
const WALLET=/^0x[0-9a-f]{40}$/;
const safe=(x:number):boolean=>Number.isSafeInteger(x)&&x>=2;

export function checkMultilevelPromotionPreflight(
  input:PromotionPreflightInput,
):PromotionPreflightResult {
  const id=safe(input?.roundId)?input.roundId:0;
  const reasons:string[]=[];
  if(!input || !['testnet','testnet-staging'].includes(input.network) ||
    !safe(input.roundId) || !WALLET.test(input.wallet) ||
    !FINGERPRINT.test(input.stagedChainFingerprint) ||
    !FINGERPRINT.test(input.rescannedChainFingerprint) ||
    input.originalReview?.network!==input.network ||
    input.currentReview?.network!==input.network ||
    input.originalReview?.wallet!==input.wallet ||
    input.currentReview?.wallet!==input.wallet ||
    input.originalReview?.roundId!==input.roundId ||
    input.currentReview?.roundId!==input.roundId) {
    return {status:'BLOCKED',payable:false,roundId:id,
      reasons:['INVALID_OR_CROSS_NETWORK_SOURCE'],
      nextAction:'REVERIFY_SOURCE'};
  }
  if(input.stagedChainFingerprint!==input.rescannedChainFingerprint) {
    reasons.push('CHAIN_EVIDENCE_CHANGED_AFTER_REVIEW');
  }
  const freshness=checkMultilevelReviewFreshness(
    input.originalReview,input.currentReview
  );
  if(freshness.status!=='MATCHED_REVIEW_ONLY') {
    reasons.push(...freshness.reasons.map(s=>'REVIEW_'+s));
  }
  if(input.canonicalChainAuthorityChecked!==true) {
    reasons.push('INDEPENDENT_CHAIN_FINALITY_MISSING');
  }
  if(input.canonicalSybilAndIdentityChecked!==true) {
    reasons.push('CURRENT_SYBIL_IDENTITY_ATTESTATION_MISSING');
  }
  if(input.canonicalInviteGraphChecked!==true) {
    reasons.push('IMMUTABLE_REFERRAL_PROVENANCE_MISSING');
  }
  if(input.independentFundingReconciled!==true) {
    reasons.push('ACTUAL_B3TR_FUNDING_RECONCILIATION_MISSING');
  }
  if(input.officialRulebookClearanceVerified!==true) {
    reasons.push('RULEBOOK_CLEARANCE_REQUIRED');
  }
  return {
    status:reasons.length?'BLOCKED':'REQUIRES_OPERATOR_REVIEW',
    payable:false,roundId:input.roundId,
    reasons,
    nextAction:reasons.some(r=>r==='RULEBOOK_CLEARANCE_REQUIRED'||
      r==='ACTUAL_B3TR_FUNDING_RECONCILIATION_MISSING')
      ?'RESOLVE_RULEBOOK_AND_FUNDING'
      :reasons.length?'REVERIFY_SOURCE':'MANUAL_SECURITY_SIGNOFF',
  };
}
