import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseMultilevelRewardLog,
  parseMultilevelVoteLog,
} from '../src/lib/rewards/multilevelChainLogProof.ts';

const wallet = '0x'+'1'.repeat(40);
const ourApp = '0x'+'a'.repeat(64);
const app1 = '0x'+'b'.repeat(64);
const app2 = '0x'+'c'.repeat(64);
const sig = '0x'+'d'.repeat(64);
const tx = '0x'+'e'.repeat(64);
const topicWallet = '0x'+'0'.repeat(24)+wallet.slice(2);
const word = n => BigInt(n).toString(16).padStart(64,'0');
const ctx = {
  expectedTopic0:sig,wallet,roundId:130,startBlock:100,endBlock:200,excludedAppId:ourApp,
};
const reward = (app=app1,amount='100',changes={}) => ({
  data:'0x'+word(amount),
  topics:[sig,app,topicWallet,'0x'+'0'.repeat(64)],
  meta:{blockNumber:140,txID:tx,clauseIndex:0},...changes,
});
const voteData = (apps=[app2],weights=[1]) => {
  const left=word(apps.length)+apps.map(x=>x.slice(2)).join('');
  const right=word(weights.length)+weights.map(word).join('');
  return '0x'+word(64)+word(64+left.length/2)+left+right;
};
const vote=(apps=[app2],weights=[1],changes={})=>({
  data:voteData(apps,weights),
  topics:[sig,topicWallet,'0x'+word(130)],
  meta:{blockNumber:150,txID:tx,clauseIndex:0},...changes,
});

test('positive B3TR payment from another dApp is a valid observed reward',()=>{
  assert.deepEqual(parseMultilevelRewardLog(reward(),ctx),{
    appId:app1,txId:tx,blockNumber:140,roundId:130,rewardWei:'100',
  });
});

test('zero reward, VeInvite reward, fake wallet or invalid signature never count',()=>{
  assert.equal(parseMultilevelRewardLog(reward(app1,'0'),ctx),null);
  assert.equal(parseMultilevelRewardLog(reward(ourApp),ctx),null);
  assert.equal(parseMultilevelRewardLog(reward(app1,'100',{topics:[sig,app1,
    '0x'+'0'.repeat(64)]}),ctx),null);
  assert.equal(parseMultilevelRewardLog(reward(app1,'100',{topics:[
    '0x'+'0'.repeat(64),app1,topicWallet]}),ctx),null);
  assert.equal(parseMultilevelRewardLog(reward(app1,'100',{meta:{blockNumber:201,txID:tx}}),ctx),null);
  assert.equal(parseMultilevelRewardLog(reward(app1,'100',{data:'0xdeadbeef'}),ctx),null);
});

test('vote must decode a real weighted app from the correct voter and round',()=>{
  assert.deepEqual(parseMultilevelVoteLog(vote([app1,app2],[0,5]),ctx),{
    votedAppId:app2,txId:tx,blockNumber:150,roundId:130,
  });
  assert.equal(parseMultilevelVoteLog(vote([app1],[0]),ctx),null);
  assert.equal(parseMultilevelVoteLog(vote([app1,app2],[1]),ctx),null);
  assert.equal(parseMultilevelVoteLog(vote([] ,[]),ctx),null);
  assert.equal(parseMultilevelVoteLog(vote([app1],[1],{topics:[sig,topicWallet,'0x'+word(129)]}),ctx),null);
  assert.equal(parseMultilevelVoteLog(vote([app1],[1],{topics:[sig,
    '0x'+'0'.repeat(64),'0x'+word(130)]}),ctx),null);
  assert.equal(parseMultilevelVoteLog(vote([app1],[1],{data:'0x'+word(9999999)+word(64)}),ctx),null);
  // Reject even syntactically in-bounds but noncanonical ABI offsets.
  const normal=voteData([app1],[1]);
  const shifted='0x'+word(96)+normal.slice(66);
  assert.equal(parseMultilevelVoteLog(vote([app1],[1],{data:shifted}),ctx),null);
});

test('wrong block and tampered event identity is never admitted',()=>{
  const bad=vote([app2],[1],{meta:{blockNumber:201,txID:tx}});
  assert.equal(parseMultilevelVoteLog(bad,ctx),null);
  assert.equal(parseMultilevelVoteLog(vote([app2],[1],{topics:[
    '0x'+'f'.repeat(64),topicWallet,'0x'+word(130)]}),ctx),null);
});
