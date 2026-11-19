/**
 * Read-only LIVE MAINNET smoke, gated to this development PR branch.
 * NEVER touches wallets or signs transactions; only public Thor event logs.
 * Does not use any real VeInvite invitee wallet; discovers arbitrary public
 * reward/vote logs in recent closed rounds and validates their ABI shape.
 * Safe to keep dormant on other branches and on deployed production runtime.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';
import {checkMultilevelFinalityGate} from '../src/lib/rewards/multilevelFinalityGate.ts';
import {
  parseMultilevelRewardLog, parseMultilevelVoteLog,
} from '../src/lib/rewards/multilevelChainLogProof.ts';

const ACTIVE_ON_THIS_PR = process.env.GITHUB_HEAD_REF ===
  'feature/multilevel-rewards-staging-20261119' &&
  process.env.VERCEL_ENV === 'preview' &&
  process.env.VECHAIN_NETWORK === 'testnet';
const NODE = 'https://mainnet.vechain.org';
const APP_ID = '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
const REWARDS_POOL='0x6Bee7DDab6c99d5B2Af0554EaEA484CE18F52631';
const ALLOCATION='0x89A00Bb0947a30FF95BEeF77a66AEdE3842Fe5B7';
const rewardAbi = new ABIEvent(
  'event RewardDistributed(uint256 amount, bytes32 indexed appId, address indexed receiver, string proof, address indexed distributor)',
);
const voteAbi = new ABIEvent(
  'event AllocationVoteCast(address indexed voter, uint256 indexed roundId, bytes32[] appsIds, uint256[] voteWeights)',
);
const votingAbi=[
  {type:'function',name:'currentRoundId',stateMutability:'view',
    inputs:[],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'getRound',stateMutability:'view',
    inputs:[{name:'roundId',type:'uint256'}],
    outputs:[{name:'',type:'tuple',components:[
      {name:'proposer',type:'address'},{name:'voteStart',type:'uint48'},
      {name:'voteDuration',type:'uint32'},
    ]}]},
];
const decodeWallet = topic =>
  typeof topic === 'string' && /^0x[0-9a-f]{64}$/i.test(topic)
    ? '0x'+topic.toLowerCase().slice(-40) : null;
const safeNumber = raw => {
  const x=Number(raw);
  return Number.isSafeInteger(x)&&x>0?x:null;
};
const topic = value => typeof value === 'string'?value:undefined;

test('public live mainnet RewardDistributed + AllocationVoteCast round logs decode', {
  skip: !ACTIVE_ON_THIS_PR,
  timeout:90000,
}, async(t) => {
  const thor=ThorClient.at(NODE);
  const contract=thor.contracts.load(ALLOCATION,votingAbi);
  const result=await contract.read.currentRoundId();
  const current=safeNumber(result[0]);
  assert.ok(current!==null && current>4,'valid mainnet current round required');
  const rewardSig=topic(rewardAbi.encodeFilterTopics([null,null,null])[0]);
  const voteSig=topic(voteAbi.encodeFilterTopics([null,null])[0]);
  assert.match(rewardSig,/^0x[0-9a-f]{64}$/i);
  assert.match(voteSig,/^0x[0-9a-f]{64}$/i);
  let rewardSeen=0,voteSeen=0,rounds=0;
  const best=await thor.blocks.getBestBlockCompressed();
  assert.ok(best&&Number.isSafeInteger(best.number));
  for(let round=current-1;round>=Math.max(1,current-4);round--){
    const details=(await contract.read.getRound(BigInt(round)))[0];
    const start=safeNumber(details?.voteStart??details?.[1]);
    const duration=safeNumber(details?.voteDuration??details?.[2]);
    assert.ok(start&&duration,'official round boundary required');
    const end=start+duration;
    if(end+24>best.number)continue;
    rounds++;
    const rewardLogs=await thor.logs.filterRawEventLogs({
      range:{unit:'block',from:start,to:end},
      options:{offset:0,limit:100},
      criteriaSet:[{address:REWARDS_POOL,topic0:rewardSig}],
      order:'asc',
    });
    const voteLogs=await thor.logs.filterRawEventLogs({
      range:{unit:'block',from:start,to:end},
      options:{offset:0,limit:100},
      criteriaSet:[{address:ALLOCATION,topic0:voteSig}],
      order:'asc',
    });
    assert.ok(Array.isArray(rewardLogs)&&Array.isArray(voteLogs));
    for(const log of rewardLogs){
      const wallet=decodeWallet(log.topics?.[2]);
      if(!wallet)continue;
      const receipt=parseMultilevelRewardLog(log,{
        wallet,roundId:round,startBlock:start,endBlock:end,
        excludedAppId:APP_ID,expectedTopic0:rewardSig,
      });
      if(receipt&&BigInt(receipt.rewardWei)>0n)rewardSeen++;
    }
    for(const log of voteLogs){
      const wallet=decodeWallet(log.topics?.[1]);
      if(!wallet)continue;
      const vote=parseMultilevelVoteLog(log,{
        wallet,roundId:round,startBlock:start,endBlock:end,
        excludedAppId:APP_ID,expectedTopic0:voteSig,
      });
      if(vote)voteSeen++;
    }
    if(rewardSeen>0&&voteSeen>0)break;
  }
  t.diagnostic('Read-only mainnet closed rounds inspected: '+rounds);
  t.diagnostic('Qualified publicly observed rewards: '+rewardSeen+'; weighted votes: '+voteSeen);
  assert.ok(rounds>0,'no settled round available');
  assert.ok(rewardSeen>0,'no positive external dApp reward logs decoded');
  assert.ok(voteSeen>0,'no valid weighted vote logs decoded');
});

const B3TR='0x5ef79995FE8a89e0812330E4378eB2660ceDe699';
const VOT3='0x76Ca782B59C74d088C7D2Cce2f211BC00836c602';
const ZERO='0x0000000000000000000000000000000000000000';
const transferAbi=new ABIEvent('event Transfer(address indexed from, address indexed to, uint256 value)');
const amountOf=(log)=>{
  const raw=log.data?.toLowerCase()??'';
  return /^0x[0-9a-f]{64}$/.test(raw) ? BigInt(raw) : 0n;
};

test('public mainnet B3TR debit matches a real VOT3 mint in same transaction', {
  skip:!ACTIVE_ON_THIS_PR,timeout:90000,
}, async(t)=>{
  const thor=ThorClient.at(NODE);
  const contract=thor.contracts.load(ALLOCATION,votingAbi);
  const result=await contract.read.currentRoundId();
  const current=safeNumber(result[0]);
  assert.ok(current&&current>4);
  const sig=topic(transferAbi.encodeFilterTopics([null,null,null])[0]);
  const mintTopics=transferAbi.encodeFilterTopics([ZERO,null,null]);
  const mintSig=topic(mintTopics[0]),zeroTopic=topic(mintTopics[1]);
  assert.ok(mintSig&&zeroTopic&&mintSig===sig);
  let found=0,checked=0;
  const best=await thor.blocks.getBestBlockCompressed();
  assert.ok(best?.number);
  for(let round=current-1;round>=Math.max(1,current-4)&&found===0;round--){
    const detail=(await contract.read.getRound(BigInt(round)))[0];
    const start=safeNumber(detail?.voteStart??detail?.[1]);
    const duration=safeNumber(detail?.voteDuration??detail?.[2]);
    assert.ok(start&&duration);
    const end=start+duration;
    if(end+24>best.number)continue;
    const mints=await thor.logs.filterRawEventLogs({
      range:{unit:'block',from:start,to:end},
      options:{offset:0,limit:50},
      criteriaSet:[{address:VOT3,topic0:sig,topic1:zeroTopic}],
      order:'asc',
    });
    assert.ok(Array.isArray(mints));
    for(const mint of mints.slice(0,12)){
      const amount=amountOf(mint),wallet=decodeWallet(mint.topics?.[2]);
      const block=mint.meta?.blockNumber,txId=mint.meta?.txID?.toLowerCase();
      if(amount<=0n||!wallet||!Number.isSafeInteger(block)||
        !/^0x[0-9a-f]{64}$/.test(txId??''))continue;
      checked++;
      const transferTopics=transferAbi.encodeFilterTopics([wallet,VOT3,null]);
      const debits=await thor.logs.filterRawEventLogs({
        range:{unit:'block',from:block,to:block},
        options:{offset:0,limit:50},
        criteriaSet:[{
          address:B3TR,topic0:topic(transferTopics[0]),
          topic1:topic(transferTopics[1]),
          topic2:topic(transferTopics[2]),
        }],
        order:'asc',
      });
      assert.ok(Array.isArray(debits));
      if(debits.some(d=>
        d.meta?.txID?.toLowerCase()===txId &&
        d.meta?.clauseIndex===mint.meta?.clauseIndex &&
        amountOf(d)===amount
      )){
        found++;
        break;
      }
    }
  }
  t.diagnostic('Read-only mainnet VOT3 mints checked: '+checked+'; matching 2-sided conversion: '+found);
  assert.ok(found>0,'no authentic paired B3TR -> VOT3 conversion found');
});

test('official VeChain FINAL revision covers at least one completed round', {
  skip:!ACTIVE_ON_THIS_PR, timeout:90000,
}, async(t)=>{
  const thor=ThorClient.at(NODE);
  const [final,best]=await Promise.all([
    thor.blocks.getFinalBlockCompressed(),
    thor.blocks.getBestBlockCompressed(),
  ]);
  assert.ok(final && Number.isSafeInteger(final.number) && final.number>0);
  assert.match(final.id,/^0x[0-9a-f]{64}$/i);
  assert.ok(best && Number.isSafeInteger(best.number));
  const contract=thor.contracts.load(ALLOCATION,votingAbi);
  const current=safeNumber((await contract.read.currentRoundId())[0]);
  assert.ok(current && current>4);
  let found=false;
  for(let round=current-1;round>=Math.max(1,current-5);round--){
    const detail=(await contract.read.getRound(BigInt(round)))[0];
    const start=safeNumber(detail?.voteStart??detail?.[1]);
    const duration=safeNumber(detail?.voteDuration??detail?.[2]);
    if(!start||!duration)continue;
    const end=start+duration;
    const result=checkMultilevelFinalityGate({
      finalBlockId:final.id,finalizedThroughBlock:final.number,
      bestBlock:best.number,dappRoundEndBlock:end,
      voteRoundEndBlock:end,
    });
    if(result.ok) {
      found=true;
      t.diagnostic('Official FINAL block '+final.number+
        ' confirms closed round '+round+' end '+end);
      break;
    }
  }
  assert.ok(found,'no recently closed round is consensus FINAL on this node');
});
