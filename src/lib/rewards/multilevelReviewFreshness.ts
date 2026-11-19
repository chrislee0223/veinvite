/**
 * Last, immutable REVIEW freshness barrier (never a payout authorization).
 * A previously observed/approved-in-principle candidate must be recomputed
 * from freshly retrieved chain, Sybil and historical lineage sources at the
 * moment of future settlement. A revision change always requires review.
 */
import type {ProposedMultilevelReview} from './multilevelCandidateReconciliation';
import type {ProposedNewOnboardingReview} from './multilevelOnboardingReconciliation';

export type NonpayableMultilevelReview=
  | ProposedMultilevelReview | ProposedNewOnboardingReview;
export type ReviewFreshnessVerdict={
  status:'MATCHED_REVIEW_ONLY'|'RECHECK_REQUIRED';
  payable:false;
  reasons:string[];
};

export function checkMultilevelReviewFreshness(
  previous:NonpayableMultilevelReview,
  newlyComputed:NonpayableMultilevelReview,
):ReviewFreshnessVerdict {
  const reasons:string[]=[];
  if(!previous || !newlyComputed ||
    previous.payable!==false || newlyComputed.payable!==false ||
    previous.status!=='REVIEW_REQUIRED' ||
    newlyComputed.status!=='REVIEW_REQUIRED'){
    return{status:'RECHECK_REQUIRED',payable:false,
      reasons:['MISSING_OR_NON_REVIEW_SOURCE']};
  }
  if(previous.network!==newlyComputed.network ||
    previous.wallet!==newlyComputed.wallet ||
    previous.roundId!==newlyComputed.roundId ||
    previous.source!==newlyComputed.source) {
    reasons.push('IDENTITY_OR_MISSION_KIND_CHANGED');
  }
  if(!previous.structurallyEligible || !newlyComputed.structurallyEligible ||
    previous.rejectionReasons?.length>0 ||
    newlyComputed.rejectionReasons?.length>0){
    reasons.push('ELIGIBILITY_REVOKED_OR_UNVERIFIED');
  }
  if(previous.evidenceFingerprint!==newlyComputed.evidenceFingerprint ||
    !/^[a-f0-9]{64}$/.test(previous.evidenceFingerprint||'')){
    reasons.push('EVIDENCE_OR_SYBIL_REVISION_CHANGED');
  }
  const prevLineage=previous.lineage?.ancestors;
  const latestLineage=newlyComputed.lineage?.ancestors;
  if(!Array.isArray(prevLineage)||!Array.isArray(latestLineage) ||
    JSON.stringify(prevLineage)!==JSON.stringify(latestLineage) ||
    JSON.stringify(previous.lineage?.edgeIds)!==
      JSON.stringify(newlyComputed.lineage?.edgeIds) ||
    previous.lineage?.eventBlock!==newlyComputed.lineage?.eventBlock){
    reasons.push('UPLINE_SNAPSHOT_CHANGED');
  }
  return {
    status:reasons.length===0?'MATCHED_REVIEW_ONLY':'RECHECK_REQUIRED',
    payable:false,reasons,
  };
}
