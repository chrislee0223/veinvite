import assert from 'node:assert/strict';
import test from 'node:test';
import {
  stableMultilevelChainObservation,
  fingerprintMultilevelChainObservation,
} from '../src/lib/rewards/multilevelPreviewEvidenceSnapshot.ts';

const wallet='0x'+'a'.repeat(40);
const tx='0x'+'b'.repeat(64), app='0x'+'c'.repeat(64);
const scan={
  authority:'READ_ONLY_CHAIN_OBSERVATION',kind:'ACTIVE',
  wallet,network:'testnet',earningRoundId:131,dappRoundId:131,
  dappWindow:{roundId:131,startBlock:100,endBlock:199},
  voteWindow:{roundId:131,startBlock:100,endBlock:199},
  maturityDepthBlocks:24,verifiedThroughBlock:240,
  rewardedDapps:[{appId:app,txId:tx,blockNumber:122,roundId:131,rewardWei:'10'}],
  votes:[{votedAppId:app,txId:tx,blockNumber:142,roundId:131}],
  conversion:null,verdict:{eligible:true,countedAppIds:[app],eligibleVoteTxId:tx},
};
test('closed-round chain proof fingerprint stable after later best block',()=>{
  const x=fingerprintMultilevelChainObservation(scan);
  const y=fingerprintMultilevelChainObservation({...scan,verifiedThroughBlock:320});
  assert.equal(x,y);
  assert.match(x,/^[0-9a-f]{64}$/);
  const body=stableMultilevelChainObservation(scan);
  assert.equal(body.wallet,wallet);
  assert.equal(body.voteWindow.endBlock,199);
  assert.equal(body.authority,'READ_ONLY_CHAIN_OBSERVATION');
});
test('a different rewarded amount or round boundary is a different proof',()=>{
  const x=fingerprintMultilevelChainObservation(scan);
  assert.notEqual(x,fingerprintMultilevelChainObservation({
    ...scan,rewardedDapps:[{...scan.rewardedDapps[0],rewardWei:'9'}],
  }));
  assert.notEqual(x,fingerprintMultilevelChainObservation({
    ...scan,voteWindow:{...scan.voteWindow,endBlock:200},
  }));
});
