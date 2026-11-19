import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  reconcileMultilevelActiveCandidate,
  type ProposedMultilevelReview,
} from '@/lib/rewards/multilevelCandidateReconciliation';
import {
  fingerprintMultilevelChainObservation,
} from '@/lib/rewards/multilevelPreviewEvidenceSnapshot';
import type { MultilevelChainScan } from '@/lib/rewards/multilevelChainEvidenceReader';
import type { LegacyMembershipInput } from '@/lib/rewards/multilevelLegacyEligibility';
import type { TrustedReferralEdge } from '@/lib/rewards/multilevelUplineSnapshot';
import {reconcileMultilevelOnboardingCandidate,
  type TrustedNewOnboarding,
  type ProposedNewOnboardingReview} from '@/lib/rewards/multilevelOnboardingReconciliation';

const PREVIEW_URL='https://bpppslplhmppxzvdkwxs.supabase.co';

/**
 * Not invoked by any deployed route, cron, or claim.
 * This saves ONLY an immutable human-review packet for a pre-existing
 * testnet preview chain observation. NO financial entitlement possible.
 */
function guardPreview(network:string) {
  if(process.env.VERCEL_ENV!=='preview' ||
    process.env.NEXT_PUBLIC_SUPABASE_URL!==PREVIEW_URL ||
    process.env.VEINVITE_MULTILEVEL_PREVIEW_REVIEW_ENABLED!=='true' ||
    !['testnet','testnet-staging'].includes(network) ||
    process.env.VECHAIN_NETWORK!==network) {
    throw new Error('MULTILEVEL_REVIEW_BRIDGE_PREVIEW_ONLY');
  }
}

export async function recordMultilevelPreviewReview(input:{
  chain:MultilevelChainScan;
  legacy:LegacyMembershipInput;
  /** Canonical historical graph edges, independent of user-supplied UI data. */
  referralEdges:readonly TrustedReferralEdge[];
  /** Independently chain-observed qualified active participants for this round. */
  roundActiveWallets:ReadonlySet<string>;
  /** Must equal the earlier private candidate chain observation hash. */
  scanFingerprint:string;
}):Promise<{
  status:'REVIEW_PACKET_STORED_NONPAYABLE' |
    'ALREADY_REVIEWED_NONPAYABLE' | 'STRUCTURALLY_REJECTED_NO_WRITE';
  proposed:ProposedMultilevelReview;
}> {
  guardPreview(input?.chain?.network);
  const proposed=reconcileMultilevelActiveCandidate(input);
  if(!proposed.structurallyEligible) {
    return {status:'STRUCTURALLY_REJECTED_NO_WRITE',proposed};
  }
  // The exact bytes of the independent already-staged chain observation
  // must match this review request. A submitted browser fingerprint is
  // never sufficient to create a payable event.
  if(input.scanFingerprint!==fingerprintMultilevelChainObservation(input.chain)) {
    throw new Error('MULTILEVEL_REVIEW_CHAIN_PROOF_HASH_MISMATCH');
  }
  const {data,error}=await supabaseAdmin.rpc(
    'multilevel_preview_record_review_packet_v1',{
      p_network:proposed.network,
      p_round_id:proposed.roundId,
      p_wallet:proposed.wallet,
      p_source_scan_fingerprint:input.scanFingerprint,
      p_evidence_fingerprint:proposed.evidenceFingerprint,
      p_packet:proposed,
    },
  );
  if(error) throw new Error('MULTILEVEL_REVIEW_PACKET_WRITE_REJECTED:'+error.code);
  if(data!=='REVIEW_PACKET_STORED_NONPAYABLE' &&
     data!=='ALREADY_REVIEWED_NONPAYABLE') {
    throw new Error('MULTILEVEL_REVIEW_UNKNOWN_DB_RESPONSE');
  }
  return {status:data,proposed};
}

/** New onboarding review: same private nonpayable RPC, no new public API. */
export async function recordMultilevelPreviewOnboardingReview(input:{
  chain:MultilevelChainScan;
  onboarding:TrustedNewOnboarding;
  referralEdges:readonly TrustedReferralEdge[];
  roundActiveWallets:ReadonlySet<string>;
  scanFingerprint:string;
}):Promise<{
  status:'REVIEW_PACKET_STORED_NONPAYABLE'|
    'ALREADY_REVIEWED_NONPAYABLE'|'STRUCTURALLY_REJECTED_NO_WRITE';
  proposed:ProposedNewOnboardingReview;
}> {
  guardPreview(input?.chain?.network);
  const proposed=reconcileMultilevelOnboardingCandidate(input);
  if(!proposed.structurallyEligible){
    return {status:'STRUCTURALLY_REJECTED_NO_WRITE',proposed};
  }
  if(input.scanFingerprint!==fingerprintMultilevelChainObservation(input.chain)){
    throw new Error('MULTILEVEL_NEW_REVIEW_CHAIN_HASH_MISMATCH');
  }
  const {data,error}=await supabaseAdmin.rpc(
    'multilevel_preview_record_review_packet_v1',{
      p_network:proposed.network,
      p_round_id:proposed.roundId,
      p_wallet:proposed.wallet,
      p_source_scan_fingerprint:input.scanFingerprint,
      p_evidence_fingerprint:proposed.evidenceFingerprint,
      p_packet:proposed,
    },
  );
  if(error)throw new Error('MULTILEVEL_NEW_REVIEW_WRITE_REJECTED:'+error.code);
  if(data!=='REVIEW_PACKET_STORED_NONPAYABLE' &&
    data!=='ALREADY_REVIEWED_NONPAYABLE'){
    throw new Error('MULTILEVEL_NEW_REVIEW_UNKNOWN_DB_RESPONSE');
  }
  return {status:data,proposed};
}
