import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStagedAdmissionBridge as validate } from '../src/lib/rewards/rewardAdmissionBridgeContract.ts';
import { readFileSync } from 'node:fs';
const scope={
  network:'mainnet',
  appId:'0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
  cohortRoundId:'123', receiptId:'10',
};
const e=10n**18n;
const w=n=>(BigInt(n)*e).toString();
function v(opts={}){
  return {
    model:'staged-disabled-v1',network:scope.network,appId:scope.appId,
    rewardCohortRoundId:'123',allocationReceiptId:'10',
    enabled:false,canAdmit:false,canGuarantee:false,canSign:false,authorizesWrite:false,
    requiresAtomicHandoff:true,requiresXAndRecoveryReconciliation:true,
    requiresUncoveredLegacyStressProof:true,
    physicalBaseAndXOutstandingWei:w(10),
    xLiveUnpaidAlreadyIncludedWei:w(5),
    unconvertedGlobalHoldsWei:w(2),
    unconvertedCohortHoldsWei:w(2),
    existingCohortLifetimeCommittedWei:w(20),
    cohortEffectiveBudgetWei:w(100),
    globalLiabilityIncludingHoldsWei:w(12),
    cohortLifetimePlusHoldsWei:w(22),
    globalHoldsCount:1,accountingConsistent:true,...opts,
  };
}
test('real staging RPC with base + LIVE X + guarantee remains disarmed and counts X once',()=>{
  const s=validate(v(),scope);
  assert.equal(s.status,'STAGING_DISABLED');
  assert.equal(s.xLiveIncludedWei,w(5));
  assert.equal(s.totalPhysicalLiabilityWei,w(12));
  assert.equal(s.authorizesAdmission,false);
  assert.equal(s.authorizesPayout,false);
});
test('exactly converts a future 2 B3TR guarantee to fixed base liability without overlap',()=>{
  const s=validate(v({physicalBaseAndXOutstandingWei:w(12),
    unconvertedGlobalHoldsWei:'0',unconvertedCohortHoldsWei:'0',
    existingCohortLifetimeCommittedWei:w(22),
    globalLiabilityIncludingHoldsWei:w(12),cohortLifetimePlusHoldsWei:w(22),
    globalHoldsCount:0}),scope);
  assert.equal(s.totalPhysicalLiabilityWei,w(12));
});
test('a committed X PAID stays in lifetime but is not counted twice in physical pool',()=>{
  const s=validate(v({xLiveUnpaidAlreadyIncludedWei:'0'}),scope);
  assert.equal(s.totalPhysicalLiabilityWei,w(12));
  assert.equal(s.xLiveIncludedWei,'0');
});
test('future-caught cohort oversubscription must be reported, never promised',()=>{
  const s=validate(v({cohortEffectiveBudgetWei:w(21),accountingConsistent:false}),scope);
  assert.equal(s.status,'COHORT_OVERCOMMITTED');
  assert.equal(s.authorizesAdmission,false);
});
test('reject a shadow-to-live privilege flip or missing safety prerequisites',()=>{
  for(const opts of [{enabled:true},{canAdmit:true},{canSign:true},{canGuarantee:true},
    {authorizesWrite:true},{requiresAtomicHandoff:false},
    {requiresXAndRecoveryReconciliation:false},{requiresUncoveredLegacyStressProof:false}]){
    assert.throws(()=>validate(v(opts),scope));
  }
});
test('reject mismatched receipt, cohort, network or app scope',()=>{
  for(const opts of [{rewardCohortRoundId:'124'},{allocationReceiptId:'11'},
    {network:'testnet'},{appId:'0x'+'a'.repeat(64)}]){
    assert.throws(()=>validate(v(opts),scope));
  }
});
test('reject X double counting, inconsistent lifetime or bad exact Wei',()=>{
  for(const opts of [
    {xLiveUnpaidAlreadyIncludedWei:w(11)},
    {globalLiabilityIncludingHoldsWei:w(17)},
    {cohortLifetimePlusHoldsWei:w(24)},
    {unconvertedCohortHoldsWei:w(3)},
    {physicalBaseAndXOutstandingWei:'2.1'},
    {existingCohortLifetimeCommittedWei:'-1'},
    {accountingConsistent:false},{globalHoldsCount:1.5}
  ]) assert.throws(()=>validate(v(opts),scope));
});
test('reject impossible global HELD count-to-Wei snapshots before reporting safe staging',()=>{
  for (const opts of [
    {globalHoldsCount:0,unconvertedGlobalHoldsWei:w(2),unconvertedCohortHoldsWei:w(2),globalLiabilityIncludingHoldsWei:w(12)},
    {globalHoldsCount:1,unconvertedGlobalHoldsWei:'0',unconvertedCohortHoldsWei:'0',globalLiabilityIncludingHoldsWei:w(10),cohortLifetimePlusHoldsWei:w(20)},
    {globalHoldsCount:3,unconvertedGlobalHoldsWei:'2',unconvertedCohortHoldsWei:'0',globalLiabilityIncludingHoldsWei:(10n*e+2n).toString(),cohortLifetimePlusHoldsWei:w(20)},
  ]) assert.throws(()=>validate(v(opts),scope),/count\\/Wei reconciliation drift/);
  const validZero=validate(v({
    globalHoldsCount:0,unconvertedGlobalHoldsWei:'0',unconvertedCohortHoldsWei:'0',
    globalLiabilityIncludingHoldsWei:w(10),cohortLifetimePlusHoldsWei:w(20)
  }),scope);
  assert.equal(validZero.status,'STAGING_DISABLED');
});
test('staged RPC is available only in unused server-only read module',()=>{
  const s=readFileSync(new URL('../src/lib/rewards/readStagedAdmissionFundingStatus.ts',import.meta.url),'utf8');
  assert.match(s,/import 'server-only'/);
  assert.match(s,/read_reward_admission_bridge_status_v1/);
  assert.match(s,/validateStagedAdmissionBridge/);
  assert.doesNotMatch(s,/\.insert\(|\.update\(|\.delete\(/);
});
