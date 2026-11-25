import assert from 'node:assert/strict';
import {test} from 'node:test';
import {verifyMissionAttemptProof as check} from '../src/lib/rewards/missionWindowEvidence.ts';
import {calculateMissionWindowQuote as quote} from '../src/lib/rewards/missionWindowRewardMath.ts';
import {readFileSync} from 'node:fs';
const R = {
  attemptStartBlock: 100, dappRoundId: 126,
  dappRoundStartBlock: 90, dappRoundEndBlock: 199,
  voteRoundId: 127, voteRoundStartBlock: 200,
  voteRoundEndBlock: 299,
  dappRewards: [1,2,3].map((i)=>({
    appId:'0x'+String(i).padStart(64,'0'),blockNumber:110+i,
    txIndex:0,clauseIndex:0
  })),
  conversion: {blockNumber:115,txIndex:0,clauseIndex:0},
  vote: {roundId:127,blockNumber:220,txIndex:0,clauseIndex:0},
};
test('three distinct new-round dApps followed by next-round vote complete exactly one attempt',()=>{
  let result=check(R);assert.equal(result.state,'COMPLETE');assert.equal(result.countedAppIds.length,3);
});
test('an older attempt and a late dApp may not be recycled',()=>{
  assert.equal(check({...R,dappRewards:[{...R.dappRewards[0],blockNumber:99},...R.dappRewards.slice(1)]}).state,'NEED_DAPPS');
  assert.equal(check({...R,dappRewards:[...R.dappRewards.slice(0,2),{...R.dappRewards[2],blockNumber:200}]}).state,'NEED_DAPPS');
});
test('three distinct dApps, not repeat transactions from the same dApp',()=>{
  assert.equal(check({...R,dappRewards:[R.dappRewards[0],R.dappRewards[0],R.dappRewards[1]]}).state,'NEED_DAPPS');
  assert.equal(check({...R,dappRewards:[R.dappRewards[0],{...R.dappRewards[1],appId:R.dappRewards[0].appId.toUpperCase()},R.dappRewards[2]]}).state,'NEED_DAPPS');
});
test('vote must be from next round and strictly later than conversion',()=>{
  assert.equal(check({...R,vote:{...R.vote,roundId:126}}).state,'INVALID');
  assert.equal(check({...R,vote:{...R.vote,blockNumber:300}}).state,'INVALID');
  assert.equal(check({...R,vote:{...R.vote,blockNumber:115}}).state,'INVALID');
  assert.equal(check({...R,conversion:{blockNumber:110,txIndex:0,clauseIndex:0}}).state,'INVALID');
});
test('avoid a false completed state for missing conversion or vote',()=>{
  assert.equal(check({...R,conversion:null}).state,'NEED_CONVERSION');
  assert.equal(check({...R,vote:null}).state,'NEED_NEXT_ROUND_VOTE');
  assert.equal(check({...R,dappRewards:[R.dappRewards[0]]}).state,'NEED_DAPPS');
});
test('invalid round positions fail closed rather than mark expired',()=>{
  assert.equal(check({...R,voteRoundId:128}).state,'INVALID');
  assert.equal(check({...R,attemptStartBlock:200}).state,'INVALID');
  assert.equal(check({...R,dappRoundEndBlock:201}).state,'INVALID');
  assert.equal(check({...R,dappRewards:[{...R.dappRewards[0],txIndex:-1}]}).state,'INVALID');
});
test('three possible winners freeze a fair exact-wei quote without creating a payable claim',()=>{
  const pool=(7413807712268098494020n).toString();
  const a=quote({observedPoolWei:pool,immutableLiabilityWei:'0',
    activeWindowParticipants:3,xOptionWeiPerParticipant:'10000000000000000000'});
  assert.deepEqual(a,{status:'READY',rewardWei:'2461269237422699498006',
    protectedXWei:'30000000000000000000',
    totalBudgetWei:'7413807712268098494018'});
  assert.ok(BigInt(a.totalBudgetWei)<=BigInt(pool));
});
test('exhaustion and invalid money fail closed; prior immutable liabilities are protected',()=>{
  assert.equal(quote({observedPoolWei:'100',immutableLiabilityWei:'99',
    activeWindowParticipants:2,xOptionWeiPerParticipant:'10'}).status,'INSUFFICIENT_FUNDS');
  assert.throws(()=>quote({observedPoolWei:'-2',immutableLiabilityWei:'0',
    activeWindowParticipants:2,xOptionWeiPerParticipant:'0'}));
  assert.throws(()=>quote({observedPoolWei:'1',immutableLiabilityWei:'0',
    activeWindowParticipants:0,xOptionWeiPerParticipant:'0'}));
});
test('live production workers are not silently switched by read-only proof or arithmetic',()=>{
 const sweep=readFileSync('src/lib/rewards/rewardReservation.ts','utf8');
 const chain=readFileSync('src/lib/impact/syncInvitation.ts','utf8');
 assert.doesNotMatch(sweep,/missionWindowRewardMath|missionWindowEvidence/);
 assert.doesNotMatch(chain,/missionWindowRewardMath|missionWindowEvidence/);
});

test('two-round policy: third dApp after next-round vote completes at the third dApp',()=>{
  const late={...R.dappRewards[2],blockNumber:230};
  const proof={...R,allowDappsThroughVoteRound:true,dappRewards:[...R.dappRewards.slice(0,2),late]};
  assert.deepEqual(check(proof),{state:'COMPLETE',countedAppIds:R.dappRewards.map(e=>e.appId),
    completionPosition:{blockNumber:230,txIndex:0,clauseIndex:0}});
  assert.equal(check({...proof,allowDappsThroughVoteRound:false}).state,'NEED_DAPPS');
  assert.equal(check({...proof,dappRewards:[...R.dappRewards.slice(0,2),{...late,blockNumber:300}]}).state,'NEED_DAPPS');
});
test('two-round policy keeps conversion order, exact vote round and distinct dApps',()=>{
  const proof={...R,allowDappsThroughVoteRound:true};
  assert.equal(check({...proof,vote:{...R.vote,roundId:126}}).state,'INVALID');
  assert.equal(check({...proof,conversion:{blockNumber:110,txIndex:0,clauseIndex:0}}).state,'INVALID');
  assert.equal(check({...proof,dappRewards:[R.dappRewards[0],R.dappRewards[1],{...R.dappRewards[0],blockNumber:230}]}).state,'NEED_DAPPS');
  assert.equal(check({...proof,dappRewards:[{...R.dappRewards[0],blockNumber:99},...R.dappRewards.slice(1)]}).state,'NEED_DAPPS');
  assert.deepEqual(check(proof).completionPosition,{blockNumber:220,txIndex:0,clauseIndex:0});
});
test('same-block completion is the last required chain position',()=>{
  const proof={...R,allowDappsThroughVoteRound:true,
    dappRewards:[...R.dappRewards.slice(0,2),{...R.dappRewards[2],blockNumber:220,txIndex:1,clauseIndex:2}]};
  assert.deepEqual(check(proof).completionPosition,{blockNumber:220,txIndex:1,clauseIndex:2});
});
