import assert from 'node:assert/strict';
import test from 'node:test';
import { previewRewardFundingBridge as preview } from '../src/lib/rewards/rewardFundingBridgePolicy.ts';

const E=10n**18n;
const w=n=>(BigInt(n)*E).toString();
const fixture=(extra={})=>({
  enabled:true,evidenceVerified:true,disjointLiabilitySourcesVerified:true,
  onchainObservedAt:'2026-11-04T00:00:00Z',evaluatedAt:'2026-11-04T00:01:00Z',
  physicalPoolWei:w(100),existingOutstandingWei:w(20),
  existingOutstandingXHeldWei:w(10),futureAdmissionGuaranteesWei:w(20),
  olderProtectionOutsideExistingWei:w(10),safetyBufferWei:w(5),
  cohortEffectiveBudgetWei:w(80),cohortLifetimeCommittedWei:w(30),
  cohortCommittedXReservedHeldPaidWei:w(10),cohortUnconvertedGuaranteesWei:w(20),
  newMinimumWei:w(5),requestedAdmissions:1,unresolvedRecoveryOffset:false,
  uncoveredOlderStressWei:'0',...extra,
});
test('X 10 B3TR RESERVED/HELD is counted once, not added to existing liability again',()=>{
  const x=preview(fixture());
  assert.equal(x.status,'SHADOW_FITS');
  assert.equal(x.globalTotalHeldWei,w(55)); // 20 base+X, 20 new holds, 10 older, 5 buffer
  assert.equal(x.cohortTotalCommittedAndHeldWei,w(50));
  assert.equal(x.availableForNewPromisesWei,w(30)); // cohort is tighter than pool 45
  assert.equal(x.xHeldAlreadyCountedWei,w(10));
  assert.equal(x.authorizesAdmission,false);
});
test('PAID X is lifetime committed, not a live outstanding physical liability',()=>{
  const x=preview(fixture({existingOutstandingWei:w(10),existingOutstandingXHeldWei:'0',
    cohortLifetimeCommittedWei:w(30),cohortCommittedXReservedHeldPaidWei:w(10)}));
  assert.equal(x.status,'SHADOW_FITS');
  assert.equal(x.globalTotalHeldWei,w(45));
  assert.equal(x.cohortTotalCommittedAndHeldWei,w(50));
});
test('RELEASED X must not be included in either X liability bucket',()=>{
  const x=preview(fixture({existingOutstandingWei:w(10),
    existingOutstandingXHeldWei:'0',
    cohortLifetimeCommittedWei:w(20),cohortCommittedXReservedHeldPaidWei:'0'}));
  assert.equal(x.status,'SHADOW_FITS');
  assert.equal(x.xHeldAlreadyCountedWei,'0');
  assert.equal(x.xLifetimeAlreadyCountedWei,'0');
  assert.equal(x.availableForNewPromisesWei,w(40));
});
test('cannot add an X amount twice or misrepresent it as larger than its parent',()=>{
  assert.equal(preview(fixture({existingOutstandingXHeldWei:w(21)})).status,'LEDGER_INCONSISTENT');
  assert.equal(preview(fixture({cohortCommittedXReservedHeldPaidWei:w(31)})).status,'LEDGER_INCONSISTENT');
});
test('old unpaid protection, external X liability or low pool blocks further promises',()=>{
  const x=preview(fixture({existingOutstandingWei:w(50),
    existingOutstandingXHeldWei:w(35),requestedAdmissions:6}));
  assert.equal(x.status,'INSUFFICIENT');
  assert.equal(x.availableForNewPromisesWei,w(15));
});
test('X payout after hold-to-paid transition cannot increase the physical liability',()=>{
  const before=preview(fixture({existingOutstandingWei:w(20),existingOutstandingXHeldWei:w(10)}));
  const after=preview(fixture({existingOutstandingWei:w(10),existingOutstandingXHeldWei:'0'}));
  assert.equal(BigInt(before.globalTotalHeldWei)-BigInt(after.globalTotalHeldWei),BigInt(w(10)));
  assert.equal(before.cohortTotalCommittedAndHeldWei,after.cohortTotalCommittedAndHeldWei);
});
test('moving an admission floor to a fixed unpaid reward preserves total liabilities',()=>{
  const before=preview(fixture());
  const after=preview(fixture({
    existingOutstandingWei:w(25),
    futureAdmissionGuaranteesWei:w(15),
    cohortLifetimeCommittedWei:w(35),
    cohortUnconvertedGuaranteesWei:w(15)
  }));
  assert.equal(before.status,'SHADOW_FITS');
  assert.equal(after.status,'SHADOW_FITS');
  assert.equal(before.globalTotalHeldWei,after.globalTotalHeldWei);
  assert.equal(before.cohortTotalCommittedAndHeldWei,after.cohortTotalCommittedAndHeldWei);
});
test('fraud-recovery offset, stale evidence, source overlap and unfunded old tail fail closed',()=>{
  const scenarios=[
    [{unresolvedRecoveryOffset:true},'RECOVERY_OFFSET_UNRECONCILED'],
    [{onchainObservedAt:'2026-11-03T23:50:00Z'},'STALE_POOL'],
    [{disjointLiabilitySourcesVerified:false},'UNVERIFIED_DISJOINT_SOURCES'],
    [{uncoveredOlderStressWei:'1'},'LEGACY_STRESS_UNRESOLVED'],
    [{evidenceVerified:false},'UNVERIFIED_EVIDENCE'],
    [{enabled:false},'FEATURE_DISABLED']
  ];
  for(const [options,status] of scenarios){
    const x=preview(fixture(options));assert.equal(x.status,status);
    assert.equal(x.availableForNewPromisesWei,'0');
    assert.equal(x.authorizesAdmission,false);
  }
});
test('up to 1000 applicants cannot exceed available pool or cohort funds',()=>{
  for(let n=1;n<=1000;n++){
    const x=preview(fixture({requestedAdmissions:n}));
    assert.equal(x.status,n<=6?'SHADOW_FITS':'INSUFFICIENT');
    assert.equal(x.authorizesAdmission,false);
    assert.equal(x.writesPerformed,false);
  }
});
test('malformed wei, count, and time are rejected before displaying any preview',()=>{
  for(const opts of [{physicalPoolWei:'-1'},{cohortEffectiveBudgetWei:'1.5'},
    {requestedAdmissions:0},{requestedAdmissions:0.5},{newMinimumWei:'0'},
    {evaluatedAt:'2026-11-04'}, {enabled:'true'}]){
    assert.throws(()=>preview(fixture(opts)));
  }
});
