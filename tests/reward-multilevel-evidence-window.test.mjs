import assert from 'node:assert/strict';
import test from 'node:test';
import { checkMissionEvidence } from '../src/lib/rewards/multilevelEvidenceWindow.ts';

const wallet = '0x'+'a'.repeat(40);
const app = (n) => '0x'+n.toString(16).padStart(64,'0');
const tx = (n) => '0x'+(n+100).toString(16).padStart(64,'0');
const dappWindow = { roundId: 129, startBlock: 100, endBlock: 199 };
const voteWindow = { roundId: 130, startBlock: 200, endBlock: 299 };
const rewarded = (id, roundId=129, blockNumber=120, rewardWei='1') =>
  ({appId:app(id),txId:tx(id),blockNumber,roundId,rewardWei});
const voted = (id=99, roundId=130, blockNumber=250) =>
  ({votedAppId:app(id),txId:tx(id),blockNumber,roundId});
const onboard = (overrides={}) => ({
  kind:'ONBOARDING',
  earningRoundId:130, dappWindow, voteWindow,
  member:{
    wallet,firstOnboardedRoundId:130,
    rewardedDapps:[rewarded(1),rewarded(2),rewarded(3)],
    votes:[voted()],
  },
  ...overrides,
});
const active = (overrides={}) => ({
  kind:'ACTIVE', earningRoundId:130,
  dappWindow:voteWindow, voteWindow,
  member:{wallet,firstOnboardedRoundId:129,
    rewardedDapps:[rewarded(1,130,220)],votes:[voted(9,130,240)]},
  ...overrides,
});

test('onboarding requires rewarded dApps in R and vote in R+1, not same round',()=>{
  const ok=checkMissionEvidence(onboard());
  assert.equal(ok.eligible,true);
  assert.deepEqual(ok.countedAppIds,[app(1),app(2),app(3)]);
  assert.equal(checkMissionEvidence(onboard({
    member:{...onboard().member,votes:[voted(99,129,150)]},
  })).eligible,false);
  assert.equal(checkMissionEvidence(onboard({
    member:{...onboard().member,
      rewardedDapps:[rewarded(1,130,220),rewarded(2,130,240),rewarded(3,130,260)]},
  })).eligible,false);
});

test('repeated reward from same dApp does not satisfy three distinct dApps',()=>{
  const x=onboard();x.member.rewardedDapps=[rewarded(1),rewarded(1),rewarded(2)];
  const result=checkMissionEvidence(x);
  assert.deepEqual(result,{eligible:false,reason:'INSUFFICIENT_REWARDED_DAPPS'});
});

test('zero reward, invalid tx, wrong blocks or round cannot be reused as dApp activity',()=>{
  const x=onboard();
  x.member.rewardedDapps=[rewarded(1),rewarded(2),rewarded(3,129,300)];
  assert.equal(checkMissionEvidence(x).eligible,false);
  x.member.rewardedDapps[2]=rewarded(3,129,130,'0');
  assert.equal(checkMissionEvidence(x).eligible,false);
  x.member.rewardedDapps[2]=rewarded(3);
  x.member.rewardedDapps[2].txId='bad';
  assert.equal(checkMissionEvidence(x).eligible,false);
});

test('any dApp vote qualifies, even one different from rewarded dApps',()=>{
  const o=checkMissionEvidence(onboard());
  const a=checkMissionEvidence(active());
  assert.equal(o.eligible,true);
  assert.equal(a.eligible,true);
  assert.equal(a.countedAppIds[0],app(1));
  assert.equal(a.eligibleVoteTxId,tx(9));
});

test('active requires positive B3TR reward AND same-round vote AFTER onboarding',()=>{
  const a=active();a.member.rewardedDapps=[rewarded(1,130,230,'0')];
  assert.deepEqual(checkMissionEvidence(a),{
    eligible:false,reason:'INSUFFICIENT_REWARDED_DAPPS',
  });
  a.member.rewardedDapps=[rewarded(1,130,220)];
  a.member.votes=[];
  assert.deepEqual(checkMissionEvidence(a),{
    eligible:false,reason:'MISSING_VALID_VOTE',
  });
  a.member.votes=[voted(9)];
  a.member.firstOnboardedRoundId=130;
  assert.deepEqual(checkMissionEvidence(a),{
    eligible:false,reason:'ALREADY_ONBOARDED_OR_TOO_EARLY',
  });
});

test('bad windows and invalid onboarding completion are rejected',()=>{
  assert.equal(checkMissionEvidence(onboard({earningRoundId:1})).eligible,false);
  assert.equal(checkMissionEvidence(onboard({
    member:{...onboard().member,firstOnboardedRoundId:129},
  })).eligible,false);
  assert.equal(checkMissionEvidence(active({
    dappWindow:{roundId:130,startBlock:400,endBlock:300},
  })).eligible,false);
  assert.equal(checkMissionEvidence(active({
    member:{...active().member,wallet:'not-a-wallet'},
  })).eligible,false);
});
