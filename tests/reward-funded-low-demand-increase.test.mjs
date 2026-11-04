import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ageWeightedPendingAcceptanceStressCount as aged } from '../src/lib/rewards/pendingAcceptanceReservationRisk.ts';
import { calculatePredictiveRewardPolicy as actual } from '../src/lib/rewards/predictivePolicy.ts';
import { calculateRewardForecastPolicy as publicForecast } from '../src/lib/rewards/rewardForecastPolicy.ts';

const B3TR = 10n ** 18n;
const official = '638239330551841003930';
const protectedCohortNetFlow = '831040794989376307200';
const fundedBudget = (BigInt(official) + BigInt(protectedCohortNetFlow)).toString();
const pool = '8031167837809315805150';
const history = [0,1,5,3,0,1,3,3];
const now = Date.parse('2026-11-04T11:00:00.000Z');
const pendingOld = Array.from({length:34},()=>new Date(now-31*24*3600_000).toISOString());
const pipeline = (p=0)=>({
  queuedEligibleCount:0,voteReadyCount:0,vot3ReadyCount:0,
  appsTwoCount:0,appsOneCount:0,activatedZeroCount:2,pendingAcceptanceCount:p,
});
const quote = ({pendingCount=0,reserved='0',physical=pool,cohort='0',pipelineDelta={}}={}) =>
  actual({latestAllocationWei:official,fundingAdjustmentWei:'0',
    reserveNetFlowWei:protectedCohortNetFlow,cohortReservedWei:cohort,
    observedPoolBalanceWei:physical,reservedExistingWei:reserved,
    pipeline:{...pipeline(pendingCount),...pipelineDelta},
    completedRewardRoundRecipientCounts:history});
const publicQuote = ({reserved='0',physical=pool,pendingExpectedBps=0,pendingStressBps=0}={}) =>
  publicForecast({officialAllocationWei:official,fundingAdjustmentWei:'0',
    reserveNetFlowWei:protectedCohortNetFlow,cohortReservedWei:'0',
    observedPoolBalanceWei:physical,reservedExistingWei:reserved,
    allocationSampleCount:8,
    pipeline:{queuedEligibleCount:0,voteReadyCount:0,vot3ReadyCount:0,
      appsTwoCount:0,appsOneCount:0,activatedZeroCount:2,
      pendingAcceptanceExpectedBps:pendingExpectedBps,
      pendingAcceptanceStressBps:pendingStressBps},
    completedRewardRoundRecipientCounts:history});

test('34 stale 30+ day unaccepted links no longer dilute actual completion-time payout',()=>{
  const pending=aged(pendingOld,now);
  assert.equal(pending,0);
  const live=quote({pendingCount:pending});
  assert.equal(live.stressCompletions,3);
  assert.equal(live.historyRecipientFloor,3);
  assert.equal(live.pricingBasisWei,fundedBudget);
  assert.equal(live.rewardPerInviteWei,(BigInt(fundedBudget)/3n).toString());
  const staleUnweighted=quote({pendingCount:34});
  assert.ok(BigInt(live.rewardPerInviteWei)>BigInt(staleUnweighted.rewardPerInviteWei));
  assert.ok(BigInt(live.rewardPerInviteWei)*3n<=BigInt(fundedBudget));
});

test('actual amount for two newly activated users matches public funded forecast exactly',()=>{
  const live=quote();
  const f=publicQuote();
  assert.equal(f.expectedRecipients,3);
  assert.equal(f.historyRecipientFloor,3);
  assert.equal(f.estimatedRewardWei,live.rewardPerInviteWei);
  assert.equal(f.pricingCapacityWei,fundedBudget);
  assert.match(f.modelVersion,/aged-demand/);
  assert.match(live.algorithmVersion,/aged-demand/);
});

test('new and aging invites continue reserving demand; no blindly ignored fresh links',()=>{
  const fresh=new Date(now-20*3600_000).toISOString();
  const aging=new Date(now-48*3600_000).toISOString();
  assert.equal(aged([fresh,fresh,fresh,fresh],now),4);
  assert.equal(aged([aging,aging],now),2);
  const boosted=quote();
  const many=quote({pendingCount:aged(Array.from({length:20},()=>fresh),now)});
  assert.ok(many.stressCompletions>boosted.stressCompletions);
  assert.ok(BigInt(many.rewardPerInviteWei)<BigInt(boosted.rewardPerInviteWei));
});

test('global physical cap, existing X debt, cohort commitment and future demand remain mandatory',()=>{
  const q=quote({physical:(100n*B3TR).toString(),reserved:(20n*B3TR).toString()});
  assert.equal(q.pricingBasisWei,(80n*B3TR).toString());
  assert.ok(BigInt(q.rewardPerInviteWei)*BigInt(q.stressCompletions)<=80n*B3TR);
  const exhausted=quote({cohort:fundedBudget});
  assert.equal(exhausted.rewardPerInviteWei,'0');
  const crowded=quote({pipelineDelta:{queuedEligibleCount:6}});
  assert.ok(crowded.stressCompletions>=6);
  assert.ok(BigInt(crowded.rewardPerInviteWei)<=BigInt(fundedBudget)/6n);
});

test('reject malformed/stale counted evidence, never silently overestimate payout',()=>{
  assert.throws(()=>aged(null,now));
  assert.throws(()=>aged(['2026-11-01T11:00:00Z'],Infinity));
  assert.throws(()=>aged([5],now));
  // Invalid dates still count as non-zero stressed demand, not as empty.
  assert.equal(aged(['no-date'],now),1);
  const planning=readFileSync(new URL('../src/lib/rewards/predictivePlanning.ts',import.meta.url),'utf8');
  const reservation=readFileSync(new URL('../src/lib/rewards/rewardReservation.ts',import.meta.url),'utf8');
  assert.match(planning,/pendingCount !== rawPipeline\.pendingAcceptanceCount|pendingCount !== rawPipeline/);
  assert.match(planning,/pendingRows\.length !== pendingCount/);
  assert.match(reservation,/ageWeightPendingAcceptanceForReservation:\s*true/);
});
