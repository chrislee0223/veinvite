import assert from 'node:assert/strict';
import test from 'node:test';
import { auditRewardTreasury } from '../src/lib/rewards/rewardTreasuryAudit.ts';

const E=10n**18n;
const w=(n)=> (BigInt(n)*E).toString();
const input=(o={})=>({
 sourceSweepsWei:w(1000),boostReleasesWei:w(900),lateCompletionReleasesWei:'0',
 recordedBankWei:w(100),recordedBankStressWei:w(90),recordedSourceRetainedWei:w(220),
 sourceOverrunCount:0,destinationOverrunCount:0,
 sourceProtections:[{cohortRound:120,sealedIncompleteCount:2,currentNonblockedIncompleteCount:2,
 lateRewardWei:w(100),weightedLateProtectionWei:w(200),promotionProtectionWei:w(20),sweptWei:w(1000)}],
 currentAllocationWei:w(500),currentBoostWei:w(200),currentEffectiveBudgetWei:w(700),
 currentCommittedWei:'0',physicalPoolWei:w(4000),
 physicalPoolObservedAt:'2026-11-03T10:00:00Z',snapshotAsOf:'2026-11-03T10:03:00Z',
 assignedPaidPairedCount:45,assignedWithoutPaidCount:0,paidWithoutAssignedCount:0,
 outstandingQueueCount:0,outstandingPayoutCount:0,...o
});
test('source sweeps minus releases exactly match bank and retained protection',()=>{
 const x=auditRewardTreasury(input());
 assert.deepEqual(x.problems,[]);
 assert.equal(x.reserve.bankCalculatedWei,w(100));
 assert.equal(x.historicalProtection.sourceRetainedWei,w(220));
});
test('ledger drift and budget mismatch refuse reconciliation',()=>{
 assert.ok(auditRewardTreasury(input({recordedBankWei:w(101)})).problems.includes('RESERVE_LEDGER_NOT_CONSERVED'));
 assert.ok(auditRewardTreasury(input({currentBoostWei:w(300)})).problems.includes('CURRENT_COHORT_FUNDING_MISMATCH'));
});
test('paid entries and assigned entries are paired, not two liabilities',()=>{
 assert.ok(auditRewardTreasury(input({assignedWithoutPaidCount:1})).problems.includes('ASSIGNED_QUEUE_WITHOUT_PAID_RECORD'));
 assert.ok(auditRewardTreasury(input({paidWithoutAssignedCount:1})).problems.includes('PAID_RECORD_WITHOUT_ASSIGNED_QUEUE'));
});
test('stress alert detects all late users completing against weighted reserves',()=>{
 const old=input().sourceProtections[0];
 const x=auditRewardTreasury(input({
  sourceProtections:[{...old,weightedLateProtectionWei:w(80)}],
  recordedSourceRetainedWei:w(100),
 }));
 assert.equal(x.historicalProtection.hypotheticalGapBeyondWeightedPlusBankStressWei,w(30));
 assert.ok(x.alerts.includes('HISTORICAL_ALL_COMPLETE_STRESS_EXCEEDS_WEIGHTED_PROTECTION'));
});
test('old pool evidence and incomplete-census drift are visible',()=>{
 const p=input().sourceProtections[0];
 const x=auditRewardTreasury(input({
  sourceProtections:[{...p,currentNonblockedIncompleteCount:1}],
  snapshotAsOf:'2026-11-03T11:00:00Z',
 }));
 assert.ok(x.alerts.some(v=>v.includes('CENSUS_DRIFT')));
 assert.ok(x.alerts.includes('POOL_OBSERVATION_STALE_OR_FUTURE'));
});
test('invalid wei fails closed',()=>{
 assert.throws(()=>auditRewardTreasury(input({recordedBankWei:'-1'})));
 assert.throws(()=>auditRewardTreasury(input({sourceOverrunCount:-1})));
});
