import assert from 'node:assert/strict';
import test from 'node:test';
import {reconcileMultilevelActiveCandidate} from '../src/lib/rewards/multilevelCandidateReconciliation.ts';

const wallet=n=>'0x'+n.toString(16).padStart(40,'0');
const dappId='0x'+'a'.repeat(64);
const tx=n=>'0x'+n.toString(16).padStart(64,'0');
const subject=wallet(1),inviter=wallet(2),above=wallet(3);
const legacy={
  wallet:subject,network:'mainnet',earningRoundId:130,
  invitation:{
    inviteCode:'ABC2345',network:'mainnet',inviteeWallet:subject,
    status:'COMPLETED',rewardStatus:'PAID',sybilStatus:'CLEAR',
    identityLinkStatus:'NO_KNOWN_LINK',appsCompleted:3,
    voteCompleted:true,vot3Converted:true,
    vot3ConversionTxId:tx(30),activationBlock:100,
    appsCompletedBlock:120,voteCompletedBlock:190,voteRoundId:129,
  },
  currentAssessment:{inviteCode:'ABC2345',network:'mainnet',state:'CLEAR',revision:3},
  hasActiveInvalidation:false,hasActiveInviteeWalletRestriction:false,
};
const chain={
  wallet:subject,network:'mainnet',kind:'ACTIVE',
  earningRoundId:130,dappRoundId:130,
  authority:'READ_ONLY_CHAIN_OBSERVATION',
  maturityDepthBlocks:24,verifiedThroughBlock:350,
  dappWindow:{roundId:130,startBlock:200,endBlock:299},
  voteWindow:{roundId:130,startBlock:200,endBlock:299},
  rewardedDapps:[{appId:dappId,txId:tx(40),rewardWei:'1',
    blockNumber:220,roundId:130}],
  votes:[{votedAppId:dappId,txId:tx(41),blockNumber:230,roundId:130}],
  conversion:null,verdict:{eligible:true,countedAppIds:[dappId],eligibleVoteTxId:tx(41)},
};
const edges=[
  {edgeId:'edge-1',network:'mainnet',childWallet:subject,sponsorWallet:inviter,effectiveBlock:101},
  {edgeId:'edge-2',network:'mainnet',childWallet:inviter,sponsorWallet:above,effectiveBlock:109},
];
const make=(patch={})=>({
  chain:{...chain},legacy:{...legacy},
  referralEdges:edges,roundActiveWallets:new Set([subject,inviter]),
  ...patch,
});

test('observed chain plus cleared legacy and event-time ancestors yields review only, NEVER a payout',()=>{
  const x=reconcileMultilevelActiveCandidate(make());
  assert.equal(x.structurallyEligible,true);
  assert.equal(x.status,'REVIEW_REQUIRED');
  assert.equal(x.payable,false);
  assert.deepEqual(x.rejectionReasons,[]);
  assert.equal(x.lineage.eventBlock,230);
  assert.equal(x.lineage.ancestors[0].wallet,inviter);
  assert.equal(x.lineage.ancestors[0].active,true);
  assert.equal(x.lineage.ancestors[1].wallet,above);
  assert.equal(x.lineage.ancestors[1].active,false);
  assert.match(x.evidenceFingerprint,/^[a-f0-9]{64}$/);
  assert.equal(x.evidenceFingerprint,reconcileMultilevelActiveCandidate(make()).evidenceFingerprint);
});

test('historical Sybil invalidation and live wallet restrictions always reject',()=>{
  const invalid=reconcileMultilevelActiveCandidate(make({
    legacy:{...legacy,hasActiveInvalidation:true},
  }));
  assert.equal(invalid.structurallyEligible,false);
  assert.ok(invalid.rejectionReasons.includes('LEGACY_HISTORICALLY_INVALIDATED'));
  const banned=reconcileMultilevelActiveCandidate(make({
    legacy:{...legacy,hasActiveInviteeWalletRestriction:true},
  }));
  assert.equal(banned.structurallyEligible,false);
  assert.ok(banned.rejectionReasons.includes('LEGACY_CURRENT_WALLET_RESTRICTED'));
});

test('a fake eligible flag does not override an actual zero reward or absent vote',()=>{
  const emptyReward=reconcileMultilevelActiveCandidate(make({
    chain:{...chain,rewardedDapps:[{...chain.rewardedDapps[0],rewardWei:'0'}]},
  }));
  assert.equal(emptyReward.structurallyEligible,false);
  assert.ok(emptyReward.rejectionReasons.includes('CHAIN_ACTIVITY_OR_VOTE_UNVERIFIED'));
  const noVote=reconcileMultilevelActiveCandidate(make({
    chain:{...chain,votes:[]},
  }));
  assert.equal(noVote.structurallyEligible,false);
});

test('wallet or round mismatch is a hard error, not a fallback',()=>{
  assert.throws(()=>reconcileMultilevelActiveCandidate(make({
    legacy:{...legacy,wallet:wallet(9)},
  })),/MULTILEVEL_UNTRUSTED_CROSSCHECK_INPUT/);
  assert.throws(()=>reconcileMultilevelActiveCandidate(make({
    chain:{...chain,dappRoundId:129},
  })),/MULTILEVEL_UNTRUSTED_CROSSCHECK_INPUT/);
  assert.throws(()=>reconcileMultilevelActiveCandidate(make({
    chain:{...chain,authority:'BROWSER_CLAIM'},
  })),/MULTILEVEL_UNTRUSTED_CROSSCHECK_INPUT/);
});

test('unmatured round and forged user-active set are never review eligible',()=>{
  const early=reconcileMultilevelActiveCandidate(make({
    chain:{...chain,verifiedThroughBlock:300},
  }));
  assert.equal(early.structurallyEligible,false);
  assert.ok(early.rejectionReasons.includes('ROUND_NOT_CLOSED_OR_UNMATURED'));
  const noActor=reconcileMultilevelActiveCandidate(make({
    roundActiveWallets:new Set([inviter]),
  }));
  assert.equal(noActor.structurallyEligible,false);
  assert.ok(noActor.rejectionReasons.includes('ACTOR_ACTIVITY_NOT_IN_INDEPENDENT_SET'));
});

test('reparenting only changes the future record; graph ambiguity fails closed',()=>{
  const moved=[
    ...edges,
    {edgeId:'new-parent',network:'mainnet',childWallet:subject,
      sponsorWallet:wallet(9),effectiveBlock:320},
  ];
  const before=reconcileMultilevelActiveCandidate(make({referralEdges:moved}));
  assert.equal(before.lineage.ancestors[0].wallet,inviter);
  const ambiguous=reconcileMultilevelActiveCandidate(make({referralEdges:[
    ...edges,{edgeId:'conflict',network:'mainnet',childWallet:subject,
    sponsorWallet:wallet(9),effectiveBlock:101},
  ]}));
  assert.equal(ambiguous.structurallyEligible,false);
  assert.ok(ambiguous.rejectionReasons.includes('AMBIGUOUS_OR_INVALID_UPLINE_HISTORY'));
});

test('a legacy onboarding completed in the earning round is not active yet',()=>{
  const tooSoon=reconcileMultilevelActiveCandidate(make({
    legacy:{...legacy,invitation:{...legacy.invitation,voteRoundId:130}},
  }));
  assert.equal(tooSoon.structurallyEligible,false);
  assert.ok(tooSoon.rejectionReasons.includes('LEGACY_ONBOARDING_NOT_OLDER_THAN_ROUND'));
});

test('same-round reparenting AFTER completion cannot steal already-earned upline credit',()=>{
  const late=[...edges,{
    edgeId:'changed-mid-round',network:'mainnet',childWallet:subject,
    sponsorWallet:wallet(9),effectiveBlock:250,
  }];
  const review=reconcileMultilevelActiveCandidate(make({referralEdges:late}));
  assert.equal(review.structurallyEligible,true);
  assert.equal(review.lineage.eventBlock,230);
  assert.equal(review.lineage.ancestors[0].wallet,inviter);
  const early=[...edges,{
    edgeId:'changed-before-completion',network:'mainnet',childWallet:subject,
    sponsorWallet:wallet(9),effectiveBlock:225,
  }];
  const next=reconcileMultilevelActiveCandidate(make({referralEdges:early}));
  assert.equal(next.lineage.ancestors[0].wallet,wallet(9));
  assert.notEqual(review.evidenceFingerprint,next.evidenceFingerprint);
});
