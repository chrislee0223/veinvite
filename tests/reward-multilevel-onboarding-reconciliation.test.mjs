import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reconcileMultilevelOnboardingCandidate,
} from '../src/lib/rewards/multilevelOnboardingReconciliation.ts';

const wallet=n=>'0x'+n.toString(16).padStart(40,'0');
const app=n=>'0x'+n.toString(16).padStart(64,'0');
const tx=n=>'0x'+(n+200).toString(16).padStart(64,'0');
const subject=wallet(1),inviter=wallet(2),above=wallet(3);
const chain={
  authority:'READ_ONLY_CHAIN_OBSERVATION',network:'testnet',
  wallet:subject,kind:'ONBOARDING',earningRoundId:130,dappRoundId:129,
  activationBlock:100,
  dappWindow:{roundId:129,startBlock:100,endBlock:199},
  voteWindow:{roundId:130,startBlock:200,endBlock:299},
  maturityDepthBlocks:24,verifiedThroughBlock:400,
  finalizedThroughBlock:320,finalizedBlockId:'0x'+'f'.repeat(64),
  rewardedDapps:[1,2,3].map(n=>({
    appId:app(n),txId:tx(n),blockNumber:110+n*10,
    roundId:129,rewardWei:'10',txIndex:1,clauseIndex:n,
  })),
  conversion:{txId:tx(4),blockNumber:180,txIndex:1,clauseIndex:1,amountWei:'10'},
  votes:[{votedAppId:app(4),txId:tx(5),blockNumber:220,
    roundId:130,txIndex:1,clauseIndex:0}],
  verdict:{eligible:true,countedAppIds:[app(1),app(2),app(3)],
    eligibleVoteTxId:tx(5)},
};
const onboarding={
  inviteCode:'ABC2345',network:'testnet',inviteeWallet:subject,
  inviterWallet:inviter,status:'COMPLETED',voteRoundId:130,
  activationBlock:100,appsCompleted:3,voteCompleted:true,vot3Converted:true,
  sybilStatus:'CLEAR',identityLinkStatus:'NO_KNOWN_LINK',
  currentAssessment:{inviteCode:'ABC2345',network:'testnet',state:'CLEAR',revision:2},
  hasActiveInvalidation:false,hasActiveInviteeWalletRestriction:false,
  hasPriorSuccessfulOnboarding:false,
};
const edges=[
  {edgeId:'new-1',network:'testnet',childWallet:subject,
    sponsorWallet:inviter,effectiveBlock:100},
  {edgeId:'prior-2',network:'testnet',childWallet:inviter,
    sponsorWallet:above,effectiveBlock:90},
];
const fixture=(o={})=>({
  chain:{...chain},onboarding:{...onboarding},
  referralEdges:edges,roundActiveWallets:new Set([above]),...o,
});

test('new user qualifies structurally BEFORE being paid, direct inviter may be inactive',()=>{
  const x=reconcileMultilevelOnboardingCandidate(fixture());
  assert.equal(x.status,'REVIEW_REQUIRED');
  assert.equal(x.payable,false);
  assert.equal(x.structurallyEligible,true);
  assert.deepEqual(x.rejectionReasons,[]);
  assert.equal(x.lineage.eventBlock,220);
  assert.equal(x.lineage.ancestors[0].wallet,inviter);
  assert.equal(x.lineage.ancestors[0].active,false);
  assert.equal(x.lineage.ancestors[1].wallet,above);
  assert.match(x.evidenceFingerprint,/^[a-f0-9]{64}$/);
});

test('preexisting first success and ambiguous history never earn second onboarding',()=>{
  const duplicate=reconcileMultilevelOnboardingCandidate(fixture({
    onboarding:{...onboarding,hasPriorSuccessfulOnboarding:true},
  }));
  assert.equal(duplicate.structurallyEligible,false);
  assert.ok(duplicate.rejectionReasons.includes('LIFETIME_FIRST_ONBOARDING_ALREADY_USED_OR_UNKNOWN'));
  const unknown=reconcileMultilevelOnboardingCandidate(fixture({
    onboarding:{...onboarding,hasPriorSuccessfulOnboarding:undefined},
  }));
  assert.equal(unknown.structurallyEligible,false);
});

test('current invalidation, wallet restriction, and new Sybil state block',()=>{
  for (const x of [
    {hasActiveInvalidation:true},{hasActiveInviteeWalletRestriction:true},
    {currentAssessment:{...onboarding.currentAssessment,state:'RESTRICTED'}},
    {identityLinkStatus:'REVIEW'},
  ]){
    const review=reconcileMultilevelOnboardingCandidate(fixture({
      onboarding:{...onboarding,...x},
    }));
    assert.equal(review.structurallyEligible,false,JSON.stringify(x));
  }
});

test('missing VOT3, wrong R or missing third rewarded app all fail',()=>{
  const noVOT3=reconcileMultilevelOnboardingCandidate(fixture({
    chain:{...chain,conversion:null},
  }));
  assert.equal(noVOT3.structurallyEligible,false);
  const noThird=reconcileMultilevelOnboardingCandidate(fixture({
    chain:{...chain,rewardedDapps:chain.rewardedDapps.slice(0,2)},
  }));
  assert.equal(noThird.structurallyEligible,false);
  const wrongVote=reconcileMultilevelOnboardingCandidate(fixture({
    chain:{...chain,votes:[{...chain.votes[0],roundId:129}]},
  }));
  assert.equal(wrongVote.structurallyEligible,false);
});

test('FINAL consensus proof must cover the next-round vote',()=>{
  const a=reconcileMultilevelOnboardingCandidate(fixture({
    chain:{...chain,finalizedThroughBlock:295,verifiedThroughBlock:500},
  }));
  assert.ok(a.rejectionReasons.includes('CONSENSUS_FINALITY_UNCONFIRMED'));
  assert.equal(a.structurallyEligible,false);
});

test('direct inviter must match original invitation, not reparented graph',()=>{
  const switched=reconcileMultilevelOnboardingCandidate(fixture({
    referralEdges:[
      ...edges,
      {edgeId:'switched',network:'testnet',childWallet:subject,
        sponsorWallet:wallet(8),effectiveBlock:210},
    ],
  }));
  assert.equal(switched.structurallyEligible,false);
  assert.ok(switched.rejectionReasons.includes('DIRECT_INVITER_DIFFERS_FROM_INVITATION'));
  const after=reconcileMultilevelOnboardingCandidate(fixture({
    referralEdges:[
      ...edges,
      {edgeId:'switched',network:'testnet',childWallet:subject,
        sponsorWallet:wallet(8),effectiveBlock:250},
    ],
  }));
  assert.equal(after.structurallyEligible,true);
  assert.equal(after.lineage.ancestors[0].wallet,inviter);
});

test('a moving finalized tip does not change fixed-chain review fingerprint',()=>{
  const a=reconcileMultilevelOnboardingCandidate(fixture());
  const b=reconcileMultilevelOnboardingCandidate(fixture({
    chain:{...chain,finalizedThroughBlock:350,finalizedBlockId:'0x'+'e'.repeat(64)},
  }));
  assert.equal(a.evidenceFingerprint,b.evidenceFingerprint);
});
