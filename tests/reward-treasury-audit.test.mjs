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

test('ring-fenced cohort protections do not offset another cohort’s late deficit', () => {
 const x=auditRewardTreasury(input({
  sourceProtections:[
   {cohortRound:119,sealedIncompleteCount:0,currentNonblockedIncompleteCount:0,
    lateRewardWei:w(100),weightedLateProtectionWei:w(120),
    promotionProtectionWei:'0',sweptWei:'0'},
   {cohortRound:120,sealedIncompleteCount:1,currentNonblockedIncompleteCount:1,
    lateRewardWei:w(200),weightedLateProtectionWei:'0',
    promotionProtectionWei:'0',sweptWei:'0'},
  ],
  recordedSourceRetainedWei:w(120),recordedBankStressWei:w(90),
 }));
 assert.deepEqual(x.problems,[]);
 assert.equal(x.historicalProtection.perCohortUncoveredStressWei,w(200));
 assert.equal(x.historicalProtection.hypotheticalGapBeyondWeightedPlusBankStressWei,w(110));
 assert.ok(x.alerts.includes('HISTORICAL_ALL_COMPLETE_STRESS_EXCEEDS_WEIGHTED_PROTECTION'));
});

test('sanitized 2026-11-05 production-derived late cohort snapshot keeps 24 unfinished protected',()=>{
 // Frozen aggregate evidence only: no wallets or invite identifiers.
 const rows=[
  {
    "cohortRound": 114,
    "sealedIncompleteCount": 7,
    "currentNonblockedIncompleteCount": 6,
    "lateRewardWei": "218573871652502309639",
    "weightedLateProtectionWei": "557363372713880889579",
    "promotionProtectionWei": "182599500000000000000",
    "sweptWei": "790054228853635277893"
  },
  {
    "cohortRound": 115,
    "sealedIncompleteCount": 6,
    "currentNonblockedIncompleteCount": 5,
    "lateRewardWei": "33637365511474756174",
    "weightedLateProtectionWei": "85775282054260628244",
    "promotionProtectionWei": "0",
    "sweptWei": "149686276526062664973"
  },
  {
    "cohortRound": 116,
    "sealedIncompleteCount": 3,
    "currentNonblockedIncompleteCount": 3,
    "lateRewardWei": "40885429486108353820",
    "weightedLateProtectionWei": "42929700960413771511",
    "promotionProtectionWei": "0",
    "sweptWei": "161497446470127997590"
  },
  {
    "cohortRound": 117,
    "sealedIncompleteCount": 4,
    "currentNonblockedIncompleteCount": 4,
    "lateRewardWei": "232691422597025366016",
    "weightedLateProtectionWei": "349037133895538049024",
    "promotionProtectionWei": "0",
    "sweptWei": "814419979089588781056"
  },
  {
    "cohortRound": 118,
    "sealedIncompleteCount": 2,
    "currentNonblockedIncompleteCount": 2,
    "lateRewardWei": "110805439331916840960",
    "weightedLateProtectionWei": "199449790797450313728",
    "promotionProtectionWei": "0",
    "sweptWei": "354577405862133891072"
  },
  {
    "cohortRound": 119,
    "sealedIncompleteCount": 1,
    "currentNonblockedIncompleteCount": 1,
    "lateRewardWei": "196949790797450313728",
    "weightedLateProtectionWei": "49237447699362578432",
    "promotionProtectionWei": "0",
    "sweptWei": "738561715490438676480"
  },
  {
    "cohortRound": 120,
    "sealedIncompleteCount": 4,
    "currentNonblockedIncompleteCount": 3,
    "lateRewardWei": "145856230326545178266",
    "weightedLateProtectionWei": "218784345489817767399",
    "promotionProtectionWei": "0",
    "sweptWei": "510496806142908123929"
  },
  {
    "cohortRound": 121,
    "sealedIncompleteCount": 0,
    "currentNonblockedIncompleteCount": 0,
    "lateRewardWei": "207760198747344076800",
    "weightedLateProtectionWei": "0",
    "promotionProtectionWei": "0",
    "sweptWei": "831040794989376307200"
  }
];
 const x=auditRewardTreasury(input({
  sourceSweepsWei:'4350334653424271720193',
  boostReleasesWei:'4117643230827246354177',
  lateCompletionReleasesWei:'0',
  recordedBankWei:'232691422597025366016',
  recordedBankStressWei:'232691422597025366016',
  recordedSourceRetainedWei:'1685176573610723997917',
  sourceProtections:rows,
  currentAllocationWei:w(500),currentBoostWei:w(200),currentEffectiveBudgetWei:w(700),
 }));
 assert.equal(rows.reduce((n,r)=>n+r.currentNonblockedIncompleteCount,0),24);
 assert.equal(rows.reduce((n,r)=>n+r.sealedIncompleteCount,0),27);
 assert.deepEqual(x.problems,[]);
 assert.equal(x.historicalProtection.perCohortUncoveredStressWei,'1886604323149009696757');
 assert.ok(x.alerts.includes('HISTORICAL_ALL_COMPLETE_STRESS_EXCEEDS_WEIGHTED_PROTECTION'));
 assert.ok(x.alerts.some(s=>s.startsWith('LATE_PARTICIPANT_CENSUS_DRIFT')));
 assert.equal(x.writesPerformed,false);
});
