/**
 * Preview-only qualification review of NEW onboarding.
 * Important difference from legacy active members:
 * a new user CANNOT have reward_status=PAID as a prerequisite for earning.
 *
 * This produces only an immutable, NONPAYABLE review candidate. Inputs must
 * be freshly loaded from trustworthy sources by a separate operator pipeline.
 */
import {createHash} from 'node:crypto';
import {checkMissionEvidence} from './multilevelEvidenceWindow.ts';
import {checkMultilevelFinalityGate} from './multilevelFinalityGate.ts';
import {
  buildFiveLevelUplineSnapshot,
  type FiveLevelSnapshot,
  type TrustedReferralEdge,
} from './multilevelUplineSnapshot.ts';
import type {MultilevelChainScan} from './multilevelChainEvidenceReader';

type SybilVerdict={
  inviteCode:string;network:string;state:string;revision:number;
};
export type TrustedNewOnboarding={
  inviteCode:string;
  network:'mainnet'|'testnet'|'testnet-staging';
  inviteeWallet:string;
  inviterWallet:string;
  status:string;
  /** Current first successful onboarding completion, not a payout date. */
  voteRoundId:number|null;
  activationBlock:number|null;
  appsCompleted:number|null;
  voteCompleted:boolean|null;
  vot3Converted:boolean|null;
  sybilStatus:string|null;
  identityLinkStatus:string|null;
  currentAssessment:SybilVerdict|null;
  hasActiveInvalidation:boolean;
  hasActiveInviteeWalletRestriction:boolean;
  /** True when ANY prior completed onboarding existed before this invite. */
  hasPriorSuccessfulOnboarding:boolean;
};
export type ProposedNewOnboardingReview={
  status:'REVIEW_REQUIRED';payable:false;
  source:'READ_ONLY_ONBOARDING_CROSSCHECK_V1';
  network:string;wallet:string;roundId:number;
  /** Must match the level-1 ancestor AND the trusted original invitation. */
  directInviterWallet:string;
  evidenceFingerprint:string;lineage:FiveLevelSnapshot|null;
  structurallyEligible:boolean;rejectionReasons:string[];
};

const WALLET=/^0x[0-9a-f]{40}$/;
const CODE=/^[A-HJ-NP-Z2-9]{7}$/;
const safe=(n:number|null)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=1;

export function reconcileMultilevelOnboardingCandidate(input:{
  chain:MultilevelChainScan;
  onboarding:TrustedNewOnboarding;
  referralEdges:readonly TrustedReferralEdge[];
  roundActiveWallets:ReadonlySet<string>;
}):ProposedNewOnboardingReview {
  const c=input?.chain,n=input?.onboarding;
  if(!c||!n||c.kind!=='ONBOARDING'||
    c.authority!=='READ_ONLY_CHAIN_OBSERVATION'||
    !WALLET.test(c.wallet?.toLowerCase()??'')||
    !['mainnet','testnet','testnet-staging'].includes(c.network)||
    !safe(c.earningRoundId)||c.earningRoundId<2||
    c.dappRoundId!==c.earningRoundId-1 ||
    n.network!==c.network ||
    n.inviteeWallet?.toLowerCase()!==c.wallet.toLowerCase()||
    !WALLET.test(n.inviterWallet?.toLowerCase()??'') ||
    !CODE.test(n.inviteCode??'')||
    !c.dappWindow||!c.voteWindow ||
    !Array.isArray(c.rewardedDapps)||!Array.isArray(c.votes)||
    !input.referralEdges||!(input.roundActiveWallets instanceof Set)) {
    throw new Error('MULTILEVEL_NEW_ONBOARDING_INPUT_UNTRUSTED');
  }
  const reasons:string[]=[];
  const finality=checkMultilevelFinalityGate({
    finalBlockId:c.finalizedBlockId,
    finalizedThroughBlock:c.finalizedThroughBlock,
    bestBlock:c.verifiedThroughBlock,
    dappRoundEndBlock:c.dappWindow.endBlock,
    voteRoundEndBlock:c.voteWindow.endBlock,
  });
  if(!finality.ok)reasons.push('CONSENSUS_FINALITY_UNCONFIRMED');
  if(n.status!=='COMPLETED' || n.voteRoundId!==c.earningRoundId ||
    !safe(n.activationBlock)||n.activationBlock!==c.activationBlock ||
    n.appsCompleted===null||n.appsCompleted<3 ||
    n.voteCompleted!==true||n.vot3Converted!==true ||
    n.inviteeWallet.toLowerCase()===n.inviterWallet.toLowerCase()) {
    reasons.push('INVITATION_MILESTONES_MISMATCH');
  }
  if(n.hasPriorSuccessfulOnboarding!==false){
    reasons.push('LIFETIME_FIRST_ONBOARDING_ALREADY_USED_OR_UNKNOWN');
  }
  if(n.hasActiveInvalidation!==false ||
    n.hasActiveInviteeWalletRestriction!==false){
    reasons.push('SYBIL_OR_WALLET_RESTRICTED');
  }
  if(!n.currentAssessment || n.currentAssessment.inviteCode!==n.inviteCode ||
    n.currentAssessment.network!==c.network ||
    n.currentAssessment.state!=='CLEAR' ||
    !safe(n.currentAssessment.revision) ||
    n.sybilStatus!=='CLEAR' ||
    !['NO_KNOWN_LINK','OPERATOR_CLEARED'].includes(n.identityLinkStatus??'')){
    reasons.push('CURRENT_SYBIL_OR_IDENTITY_NOT_CLEAR');
  }
  const mission=checkMissionEvidence({
    kind:'ONBOARDING',earningRoundId:c.earningRoundId,
    dappWindow:c.dappWindow,voteWindow:c.voteWindow,
    activationBlock:c.activationBlock,conversion:c.conversion,
    member:{wallet:c.wallet,firstOnboardedRoundId:c.earningRoundId,
      rewardedDapps:c.rewardedDapps,votes:c.votes},
  });
  if(!mission.eligible||!c.verdict.eligible){
    reasons.push('ONCHAIN_3_DAPPS_VOT3_OR_NEXT_ROUND_VOTE_NOT_VERIFIED');
  }
  let lineage:FiveLevelSnapshot|null=null;
  let completionBlock:number|null=null;
  if(mission.eligible){
    const vote=c.votes.find(v=>
      v.txId.toLowerCase()===mission.eligibleVoteTxId &&
      v.roundId===c.earningRoundId);
    if(vote)completionBlock=vote.blockNumber;
  }
  if(!safe(completionBlock)){
    reasons.push('VOTE_COMPLETION_BLOCK_UNKNOWN');
  }else{
    try{
      lineage=buildFiveLevelUplineSnapshot({
        wallet:c.wallet,network:c.network,eventBlock:completionBlock,
        edges:input.referralEdges,
        roundActiveWallets:input.roundActiveWallets,
      });
      if(lineage.ancestors[0]?.wallet!==n.inviterWallet.toLowerCase()){
        reasons.push('DIRECT_INVITER_DIFFERS_FROM_INVITATION');
      }
    }catch{
      reasons.push('AMBIGUOUS_OR_MISSING_REFERRAL_CHAIN');
    }
  }
  // This digest describes a candidate, NOT a financial authorization.
  // The FINAL tip itself changes; its gate outcome is stable for final rounds.
  const evidenceFingerprint=createHash('sha256').update(JSON.stringify({
    version:'preview-onboarding-review-v1',
    wallet:c.wallet,round:c.earningRoundId,network:c.network,
    mission,rewardedDapps:c.rewardedDapps,votes:c.votes,
    conversion:c.conversion,activationBlock:c.activationBlock,
    consensusFinal:finality.ok,
    inviteCode:n.inviteCode,inviter:n.inviterWallet,
    latestAssessment:n.currentAssessment,
    hasInvalidation:n.hasActiveInvalidation,
    hasRestriction:n.hasActiveInviteeWalletRestriction,
    hasPriorSuccess:n.hasPriorSuccessfulOnboarding,
    completionBlock,ancestors:lineage?.ancestors??null,
    edgeIds:lineage?.edgeIds??null,
  })).digest('hex');
  return{
    status:'REVIEW_REQUIRED',payable:false,
    source:'READ_ONLY_ONBOARDING_CROSSCHECK_V1',
    network:c.network,wallet:c.wallet,roundId:c.earningRoundId,
    directInviterWallet:n.inviterWallet.toLowerCase(),
    evidenceFingerprint,lineage,
    structurallyEligible:reasons.length===0,rejectionReasons:reasons,
  };
}
