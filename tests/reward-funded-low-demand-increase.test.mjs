import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { calculatePredictiveRewardPolicy as actual } from '../src/lib/rewards/predictivePolicy.ts';

const E=10n**18n;
const official='638239330551841003930';
const netFlow='831040794989376307200';
const designated=(BigInt(official)+BigInt(netFlow)).toString();
const pool='8031167837809315805150';
const history=[0,1,5,3,0,1,3,3];
const pipeline=(options={})=>({queuedEligibleCount:0,voteReadyCount:0,vot3ReadyCount:0,
 appsTwoCount:0,appsOneCount:0,activatedZeroCount:2,pendingAcceptanceCount:0,...options});
function fixed({committed='0',outstanding='0',poolWei=pool,options={}}={}) {
  return actual({latestAllocationWei:official,fundingAdjustmentWei:'0',reserveNetFlowWei:netFlow,
    cohortReservedWei:committed,reservedExistingWei:outstanding,
    observedPoolBalanceWei:poolWei,pipeline:pipeline(options),
    completedRewardRoundRecipientCounts:history});
}

test('real funded cohort keeps exact three-slot safety floor', () => {
 const p=fixed();
 assert.equal(p.stressCompletions,3);
 assert.equal(p.historyRecipientFloor,3);
 assert.equal(p.pricingBasisWei,designated);
 assert.equal(p.rewardPerInviteWei,(BigInt(designated)/3n).toString());
 assert.ok(BigInt(p.rewardPerInviteWei)*3n<=BigInt(designated));
});

test('unbound pending invite never changes fixed cohort pricing', () => {
 const reservation=readFileSync(new URL('../src/lib/rewards/rewardReservation.ts',import.meta.url),'utf8');
 const planning=readFileSync(new URL('../src/lib/rewards/predictivePlanning.ts',import.meta.url),'utf8');
 assert.match(reservation,/includePendingAcceptance:\s*false/);
 assert.match(planning,/input\.includePendingAcceptance === false/);
 assert.match(planning,/pendingAcceptanceCount:\s*0/);
 assert.doesNotMatch(reservation,/ageWeightPendingAcceptanceForReservation/);
});

test('new verified eligible demand lowers subsequent fixed quote', () => {
 const baseline=fixed();
 const crowded=fixed({options:{queuedEligibleCount:6,voteReadyCount:3,appsOneCount:4}});
 assert.ok(crowded.stressCompletions>baseline.stressCompletions);
 assert.ok(BigInt(crowded.rewardPerInviteWei)<BigInt(baseline.rewardPerInviteWei));
 assert.ok(BigInt(crowded.rewardPerInviteWei)*BigInt(crowded.stressCompletions)<=BigInt(designated));
});

test('physical debts and already committed funds cannot overspend', () => {
 const reduced=fixed({poolWei:(100n*E).toString(),outstanding:(20n*E).toString()});
 assert.equal(reduced.pricingBasisWei,(80n*E).toString());
 assert.ok(BigInt(reduced.rewardPerInviteWei)*BigInt(reduced.stressCompletions)<=80n*E);
 const fullyCommitted=fixed({committed:designated});
 assert.equal(fullyCommitted.rewardPerInviteWei,'0');
 const alreadyCommitted=fixed({committed:(300n*E).toString(),outstanding:(300n*E).toString()});
 assert.equal(alreadyCommitted.cohortAvailableBudgetWei,(BigInt(designated)-300n*E).toString());
 assert.ok(BigInt(alreadyCommitted.rewardPerInviteWei)*BigInt(alreadyCommitted.stressCompletions)<=BigInt(designated)-300n*E);
});
