/**
 * Independent, READ-ONLY cross-check of a real Thor event scan with canonical
 * historical onboarding and event-time five-level referral ancestry.
 *
 * CRITICAL: This produces ONLY a human-review candidate. Neither this module
 * nor its output can create verified_events, entitlements, claims or transfers.
 * Finality attestation, linked identity, Sybil re-evaluation and an authorized
 * promotion workflow are separate launch blockers.
 */
import { createHash } from 'node:crypto';
import {
  qualifyLegacyActiveMembership,
  type LegacyMembershipInput,
} from './multilevelLegacyEligibility.ts';
import {
  buildFiveLevelUplineSnapshot,
  type TrustedReferralEdge,
  type FiveLevelSnapshot,
} from './multilevelUplineSnapshot.ts';
import {
  checkMissionEvidence,
  type MissionEvidenceInput,
} from './multilevelEvidenceWindow.ts';
import type { MultilevelChainScan } from './multilevelChainEvidenceReader';

export type ProposedMultilevelReview = {
  status:'REVIEW_REQUIRED';
  payable:false;
  source:'READ_ONLY_CHAIN_AND_LEGACY_CROSSCHECK_V1';
  wallet:string;
  network:string;
  roundId:number;
  /** Subject to independent, later source verification. */
  evidenceFingerprint:string;
  lineage:FiveLevelSnapshot | null;
  structurallyEligible:boolean;
  rejectionReasons:string[];
};

const digest=(x:unknown):string=>createHash('sha256')
  .update(JSON.stringify(x)).digest('hex');
const HEX=/^0x[0-9a-f]{40}$/;
const safe=(v:number)=>Number.isSafeInteger(v) && v>=1;

export function reconcileMultilevelActiveCandidate(input:{
  /** Observed read-only Thor logs, including authoritative contract address. */
  chain:MultilevelChainScan;
  /** Must originate from canonical backend, not a browser-supplied claim. */
  legacy:LegacyMembershipInput;
  /** A complete historical snapshot from trusted canonical relationship data. */
  referralEdges:readonly TrustedReferralEdge[];
  /** Wallets independently verified to have rewarded activity and a vote. */
  roundActiveWallets:ReadonlySet<string>;
}):ProposedMultilevelReview {
  const c=input?.chain,l=input?.legacy;
  if(!c || !l || !safe(c.earningRoundId) || c.kind!=='ACTIVE' ||
    c.authority!=='READ_ONLY_CHAIN_OBSERVATION' ||
    !HEX.test(c.wallet) || c.network!==l.network ||
    c.wallet.toLowerCase()!==l.wallet.toLowerCase() ||
    c.earningRoundId!==l.earningRoundId ||
    c.dappRoundId!==c.earningRoundId ||
    !safe(c.maturityDepthBlocks) ||
    c.maturityDepthBlocks<24 ||
    !safe(c.verifiedThroughBlock) ||
    !c.voteWindow || !c.dappWindow || !Array.isArray(c.rewardedDapps) ||
    !Array.isArray(c.votes)) {
    throw new Error('MULTILEVEL_UNTRUSTED_CROSSCHECK_INPUT');
  }
  const rejectionReasons:string[]=[];
  // Never accept a precomputed "eligible" flag from a scan as a substitute
  // for repeating the same-round proof validation on the complete snapshots.
  const evidence:MissionEvidenceInput={
    kind:'ACTIVE',earningRoundId:c.earningRoundId,
    dappWindow:c.dappWindow,voteWindow:c.voteWindow,
    member:{
      wallet:c.wallet,
      firstOnboardedRoundId:l.invitation?.voteRoundId??0,
      rewardedDapps:c.rewardedDapps,
      votes:c.votes,
    },
  };
  const rechecked=checkMissionEvidence(evidence);
  if(!rechecked.eligible || !c.verdict.eligible) {
    rejectionReasons.push('CHAIN_ACTIVITY_OR_VOTE_UNVERIFIED');
  }
  if(c.verifiedThroughBlock<c.voteWindow.endBlock+24 ||
    c.voteWindow.roundId!==c.earningRoundId ||
    c.dappWindow.roundId!==c.earningRoundId) {
    rejectionReasons.push('ROUND_NOT_CLOSED_OR_UNMATURED');
  }
  const legacy=qualifyLegacyActiveMembership(l);
  if(!legacy.eligible) {
    rejectionReasons.push('LEGACY_'+legacy.reason);
  }
  const activeWallet=c.wallet.toLowerCase();
  if(!input.roundActiveWallets?.has(activeWallet)) {
    rejectionReasons.push('ACTOR_ACTIVITY_NOT_IN_INDEPENDENT_SET');
  }
  let lineage:FiveLevelSnapshot|null=null;
  try {
    lineage=buildFiveLevelUplineSnapshot({
      wallet:activeWallet,network:c.network,
      eventBlock:c.voteWindow.endBlock,
      edges:input.referralEdges,
      roundActiveWallets:input.roundActiveWallets,
    });
  } catch {
    rejectionReasons.push('AMBIGUOUS_OR_INVALID_UPLINE_HISTORY');
  }
  // A key is stable for one round and source snapshot. It does not confer
  // a claim, and it doesn't claim that user identifiers or evidence are final.
  const evidenceFingerprint=digest({
    version:'read-only-candidate-v1',
    wallet:activeWallet,network:c.network,roundId:c.earningRoundId,
    latestLegacyAssessment:l.currentAssessment,
    legacyInviteCode:l.invitation?.inviteCode??null,
    hasInvalidation:l.hasActiveInvalidation,
    hasRestriction:l.hasActiveInviteeWalletRestriction,
    scanRewards:c.rewardedDapps,
    scanVotes:c.votes,
    voteWindow:c.voteWindow,
    ancestry:lineage?.ancestors??null,
    edges:lineage?.edgeIds??null,
  });
  return {
    status:'REVIEW_REQUIRED',
    payable:false,
    source:'READ_ONLY_CHAIN_AND_LEGACY_CROSSCHECK_V1',
    wallet:activeWallet,network:c.network,roundId:c.earningRoundId,
    evidenceFingerprint,lineage,
    structurallyEligible:rejectionReasons.length===0,
    rejectionReasons,
  };
}
