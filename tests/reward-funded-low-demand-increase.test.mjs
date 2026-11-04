import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { calculatePredictiveRewardPolicy as actual } from '../src/lib/rewards/predictivePolicy.ts';
import { calculateRewardForecastPolicy as publicForecast } from '../src/lib/rewards/rewardForecastPolicy.ts';
import { pendingAgeWeights } from '../src/lib/rewards/rewardForecastPendingWeights.ts';

const E = 10n ** 18n;
const official = '638239330551841003930';
const netFlow = '831040794989376307200';
const designated = (BigInt(official) + BigInt(netFlow)).toString();
const pool = '8031167837809315805150';
const history = [0,1,5,3,0,1,3,3];
const pipeline = (options = {}) => ({
  queuedEligibleCount:0,voteReadyCount:0,vot3ReadyCount:0,
  appsTwoCount:0,appsOneCount:0,activatedZeroCount:2,
  pendingAcceptanceCount:0,...options,
});
function fixed({committed='0', outstanding='0',poolWei=pool,options={}}={}) {
  return actual({
    latestAllocationWei:official,fundingAdjustmentWei:'0',reserveNetFlowWei:netFlow,
    cohortReservedWei:committed,reservedExistingWei:outstanding,
    observedPoolBalanceWei:poolWei,
    pipeline:pipeline(options),
    completedRewardRoundRecipientCounts:history,
  });
}
function forecast({pendingExpectedBps=0,pendingStressBps=0,options={}}={}) {
  return publicForecast({
    officialAllocationWei:official,fundingAdjustmentWei:'0',reserveNetFlowWei:netFlow,
    cohortReservedWei:'0',reservedExistingWei:'0',
    observedPoolBalanceWei:pool,allocationSampleCount:8,
    pipeline:{queuedEligibleCount:0,voteReadyCount:0,vot3ReadyCount:0,
      appsTwoCount:0,appsOneCount:0,activatedZeroCount:2,
      pendingAcceptanceExpectedBps:pendingExpectedBps,
      pendingAcceptanceStressBps:pendingStressBps,...options},
    completedRewardRoundRecipientCounts:history,
  });
}
test('current funded cohort safely offers 489.760041 B3TR with three distinct completion slots',()=>{
  const p=fixed(),f=forecast();
  assert.equal(p.stressCompletions,3);
  assert.equal(p.historyRecipientFloor,3);
  assert.equal(p.pricingBasisWei,designated);
  assert.equal(p.rewardPerInviteWei,(BigInt(designated)/3n).toString());
  assert.equal(f.estimatedRewardWei,p.rewardPerInviteWei);
  assert.equal(f.expectedRecipients,3);
  assert.ok(BigInt(p.rewardPerInviteWei)*3n<=BigInt(designated));
});

test('unbound pending invite is never priced as a member of an already-funded cohort',()=>{
  const reservation=readFileSync(new URL('../src/lib/rewards/rewardReservation.ts',import.meta.url),'utf8');
  const planning=readFileSync(new URL('../src/lib/rewards/predictivePlanning.ts',import.meta.url),'utf8');
  assert.match(reservation,/includePendingAcceptance:\s*false/);
  assert.match(planning,/input\.includePendingAcceptance === false/);
  assert.match(planning,/pendingAcceptanceCount:\s*0/);
  assert.doesNotMatch(reservation,/ageWeightPendingAcceptanceForReservation/);
  assert.doesNotMatch(planning,/ageWeightPendingAcceptanceForReservation|pendingAcceptanceReservationRisk/);
  assert.doesNotMatch(reservation,/pendingAcceptanceReservationRisk/);
});

test('stale unaccepted invitations change only public forecast demand, not fixed cohort liability',()=>{
  const now=Date.parse('2026-11-04T11:00:00Z');
  const expired=new Date(now-31*24*3600_000).toISOString();
  const fresh=new Date(now-6*3600_000).toISOString();
  assert.equal(pendingAgeWeights(expired,now).expectedBps,0);
  assert.equal(pendingAgeWeights(expired,now).stressBps,0);
  assert.ok(pendingAgeWeights(fresh,now).expectedBps>0);
  assert.ok(pendingAgeWeights(fresh,now).stressBps>0);
  assert.equal(forecast().estimatedRewardWei,fixed().rewardPerInviteWei);
  const withFresh=forecast({
    pendingExpectedBps:10_000,
    pendingStressBps:20_000,
  });
  assert.ok(BigInt(withFresh.estimatedRewardWei)<=BigInt(forecast().estimatedRewardWei));
});

test('verified eligible new users and new cohort activations lower every subsequent fixed quote',()=>{
  const empty=fixed();
  const crowded=fixed({options:{queuedEligibleCount:6,voteReadyCount:3,appsOneCount:4}});
  assert.ok(crowded.stressCompletions>empty.stressCompletions);
  assert.ok(BigInt(crowded.rewardPerInviteWei)<BigInt(empty.rewardPerInviteWei));
  assert.ok(BigInt(crowded.rewardPerInviteWei)*BigInt(crowded.stressCompletions)<=BigInt(designated));
});

test('global physical debts including X, PAID/offset lifetime and cohort caps never overspend',()=>{
  const reduced=fixed({poolWei:(100n*E).toString(),outstanding:(20n*E).toString()});
  assert.equal(reduced.pricingBasisWei,(80n*E).toString());
  assert.ok(BigInt(reduced.rewardPerInviteWei)*BigInt(reduced.stressCompletions)<=80n*E);
  const fullyCommitted=fixed({committed:designated});
  assert.equal(fullyCommitted.rewardPerInviteWei,'0');
  const alreadyCommitted=fixed({committed:(300n*E).toString(),outstanding:(300n*E).toString()});
  assert.equal(alreadyCommitted.cohortAvailableBudgetWei,(BigInt(designated)-300n*E).toString());
  assert.ok(BigInt(alreadyCommitted.rewardPerInviteWei)*BigInt(alreadyCommitted.stressCompletions) <= BigInt(designated)-300n*E);
});
