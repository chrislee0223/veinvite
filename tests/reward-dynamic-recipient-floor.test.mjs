import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateRecipientDemandFloor } from '../src/lib/rewards/recipientDemandFloor.ts';
import { calculatePredictiveRewardPolicy } from '../src/lib/rewards/predictivePolicy.ts';
import { calculateRewardForecastPolicy } from '../src/lib/rewards/rewardForecastPolicy.ts';

const history = [5,3,0,1,3,3,2];
const pipeline = { queuedEligibleCount:0, voteReadyCount:0, vot3ReadyCount:0,
  appsTwoCount:0, appsOneCount:0, activatedZeroCount:1, pendingAcceptanceCount:0 };
const wei = 1108054393319168409600n;
const fixed = (completedRewardRoundRecipientCounts, rest=wei, pipelineOverride={}) =>
  calculatePredictiveRewardPolicy({
    latestAllocationWei: wei.toString(), fundingAdjustmentWei:'0', reserveNetFlowWei:'0',
    cohortReservedWei: (wei-rest).toString(), observedPoolBalanceWei:(wei+5000n*10n**18n).toString(),
    reservedExistingWei:(wei-rest).toString(), pipeline:{...pipeline,...pipelineOverride},
    completedRewardRoundRecipientCounts,
  });
const pub = (completedRewardRoundRecipientCounts, pipelineOverride={}) =>
  calculateRewardForecastPolicy({ officialAllocationWei:wei.toString(),
    fundingAdjustmentWei:'0',reserveNetFlowWei:'0',cohortReservedWei:'0',
    observedPoolBalanceWei:(wei+5000n*10n**18n).toString(),reservedExistingWei:'0',
    allocationSampleCount:8, completedRewardRoundRecipientCounts,
    pipeline:{...pipeline,...pipelineOverride,pendingAcceptanceExpectedBps:0,pendingAcceptanceStressBps:0},
  });

test('historical quartile follows real Sybil-clean usage without reacting to one outlier',()=>{
 assert.equal(calculateRecipientDemandFloor(history),3);
 assert.equal(calculateRecipientDemandFloor([1,1,1]),3);
 assert.equal(calculateRecipientDemandFloor([0,0,0,0,0]),3);
 assert.equal(calculateRecipientDemandFloor([2,4,5,6,6,6,7]),6);
 assert.equal(calculateRecipientDemandFloor([12,12,12,12,12,12,12,12]),8);
 assert.equal(calculateRecipientDemandFloor([0,0,0,0,0,0,0,100]),3);
});

test('all histories produce identical first-quote actual-vs-public forecasts',()=>{
 for (const h of [[],history,[2,4,5,6,6,6,7],[8,8,8,8,8,8,8,8]]) {
   const paid=fixed(h), shown=pub(h);
   if (h.length >= 4) {
     assert.equal(shown.expectedRecipients,paid.stressCompletions);
     assert.equal(shown.estimatedRewardWei,paid.rewardPerInviteWei);
   } else {
     // Bootstrap display remains more conservative than a funded reservation.
     assert.ok(shown.expectedRecipients >= paid.stressCompletions);
     assert.ok(BigInt(shown.estimatedRewardWei) <= BigInt(paid.rewardPerInviteWei));
   }
   assert.ok(BigInt(paid.rewardPerInviteWei)*BigInt(paid.stressCompletions)<=wei);
 }
});

test('active eligible demand grows the denominator above historical bound and preserves later recipients',()=>{
 const h=[3,4,5,6,6,6,7];
 const first=fixed(h);
 const busy=fixed(h,wei,{queuedEligibleCount:8,activatedZeroCount:0});
 assert.ok(busy.stressCompletions>first.stressCompletions);
 let remaining=wei;
 for(let i=0;i<20;i++){
  const amount=BigInt(fixed(h,remaining).rewardPerInviteWei);
  assert.ok(amount>0n && amount<=remaining);
  remaining-=amount;
 }
 assert.ok(remaining>=0n);
});

test('invalid inputs fail closed, history comes from a single Sybil-clean authority', async()=>{
 for (const malformed of [[1,2,-1,3],[1,2,1.5,3],Array(9).fill(2)]) {
  assert.throws(()=>calculateRecipientDemandFloor(malformed));
 }
 const reader=await readFile(new URL('../src/lib/rewards/rewardFundingHistory.ts',import.meta.url),'utf8');
 const payout=await readFile(new URL('../src/lib/rewards/predictivePlanning.ts',import.meta.url),'utf8');
 const forecast=await readFile(new URL('../src/lib/rewards/rewardForecastSnapshot.ts',import.meta.url),'utf8');
 assert.match(reader,/read_reward_forecast_history/);
 assert.match(reader,/p_recipient_limit: RECIPIENT_DEMAND_HISTORY_LIMIT/);
 assert.match(payout,/await readRewardFundingHistory/);
 assert.match(forecast,/await readRewardFundingHistory/);
 assert.doesNotMatch(reader, /(?:insert|update|delete)\s*\(/);
});


test('randomized forecast never promises more than payment authority and always fits funded budget',()=>{
  let seed=456791;
  const next=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
  for(let i=0;i<400;i++){
    const h=Array.from({length:next()%9},()=>next()%15);
    const paid=fixed(h), shown=pub(h);
    assert.ok(shown.expectedRecipients>=paid.stressCompletions);
    assert.ok(BigInt(shown.estimatedRewardWei)<=BigInt(paid.rewardPerInviteWei));
    assert.ok(BigInt(paid.rewardPerInviteWei)*BigInt(paid.stressCompletions)<=wei);
    assert.equal(paid.historyRecipientFloor,shown.historyRecipientFloor);
    assert.ok(paid.historyRecipientFloor>=3 && paid.historyRecipientFloor<=8);
  }
});
