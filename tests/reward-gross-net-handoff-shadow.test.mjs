import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {previewGrossNetHandoff as run} from '../src/lib/rewards/rewardGrossNetHandoffShadow.ts';
const e=10n**18n;
const w=n=>(BigInt(n)*e).toString();
const fixture=(options={})=>({
  guaranteeGrossWei:w(5),finalGrossQuoteWei:w(7),
  verifiedRecoveryOffsetWei:w(2),
  physicalPoolWei:w(60),existingUnpaidBaseAndXWei:w(20),
  globalUnconvertedGuaranteesWei:w(10),olderProtectionOutsideExistingWei:w(5),
  safetyBufferWei:w(5),cohortEffectiveBudgetWei:w(100),
  cohortLifetimeCommittedGrossWei:w(30),cohortUnconvertedGuaranteesWei:w(10),
  observedAt:'2026-11-04T01:00:00Z',evaluatedAt:'2026-11-04T01:01:00Z',
  immutableReceiptAndInviteMatched:true,missionFinalized:true,sybilClear:true,
  recoveryLedgerFullyVerified:true,physicalPoolEvidenceVerified:true,
  disjointSourcesVerified:true,olderStressResolved:true,alreadyFixedOrSettled:false,
  ...options,
});
test('partial recovery: gross cohort +7, actual net +5; HELD 5 converts exactly once',()=>{
  const x=run(fixture());
  assert.equal(x.status,'SIMULATION_FITS');
  assert.equal(x.globalPhysicalLiabilityBeforeWei,w(40));
  assert.equal(x.globalPhysicalLiabilityAfterWei,w(40));
  assert.equal(x.cohortLifetimeEncumberedBeforeWei,w(40));
  assert.equal(x.cohortLifetimeEncumberedAfterWei,w(42));
  assert.equal(x.simulatedNetPayableWei,w(5));
  assert.equal(x.simulatedRecoveryOffsetWei,w(2));
  assert.equal(x.authorizesHandoff,false);
  assert.equal(x.authorizesPayout,false);
  assert.equal(x.writesPerformed,false);
});
test('zero offset: higher gross quote requires genuinely free pool headroom',()=>{
  const x=run(fixture({finalGrossQuoteWei:w(8),verifiedRecoveryOffsetWei:'0'}));
  assert.equal(x.globalPhysicalLiabilityAfterWei,w(43));
  assert.equal(x.cohortLifetimeEncumberedAfterWei,w(43));
  assert.equal(x.simulatedNetPayableWei,w(8));
  assert.equal(run(fixture({finalGrossQuoteWei:w(8),verifiedRecoveryOffsetWei:'0',physicalPoolWei:w(40)})).status,'HANDOFF_UNDERFUNDED');
});
test('full verified offset: physically releases floor without triggering token payment',()=>{
  const x=run(fixture({finalGrossQuoteWei:w(5),verifiedRecoveryOffsetWei:w(5)}));
  assert.equal(x.status,'SIMULATION_FITS');
  assert.equal(x.simulatedNetPayableWei,'0');
  assert.equal(x.globalPhysicalLiabilityAfterWei,w(35));
  assert.equal(x.cohortLifetimeEncumberedAfterWei,w(40));
  assert.equal(x.simulatedPhysicalLiabilityDeltaWei,(-5n*e).toString());
});
test('X paid and held are already embedded in existing reader, never added a second time',()=>{
  const x=run(fixture());
  assert.equal(x.globalPhysicalLiabilityBeforeWei,w(40));
  const paid=run(fixture({existingUnpaidBaseAndXWei:w(10),physicalPoolWei:w(50)}));
  assert.equal(paid.globalPhysicalLiabilityBeforeWei,w(30));
  assert.equal(paid.cohortLifetimeEncumberedBeforeWei,w(40));
});
test('insufficient lifetime cohort budget blocks even physically affordable net',()=>{
  assert.equal(run(fixture({cohortEffectiveBudgetWei:w(41)})).status,'HANDOFF_UNDERFUNDED');
});
test('invalid recovery cannot create negative payable or fake free funds',()=>{
  const x=run(fixture({verifiedRecoveryOffsetWei:w(8)}));
  assert.equal(x.status,'RECOVERY_OFFSET_OVER_GROSS');
  assert.equal(x.simulatedNetPayableWei,null);
  assert.equal(x.authorizesPayout,false);
});
test('older active awards, existing X/unpaid and admitted guarantees are disjoint and protected',()=>{
  assert.equal(run(fixture({physicalPoolWei:w(39)})).status,'BASELINE_LEDGER_INCONSISTENT');
  assert.equal(run(fixture({cohortEffectiveBudgetWei:w(39)})).status,'BASELINE_LEDGER_INCONSISTENT');
  assert.equal(run(fixture({olderStressResolved:false})).status,'OLDER_COMPLETION_STRESS_UNRESOLVED');
  assert.equal(run(fixture({disjointSourcesVerified:false})).status,'POOL_OR_LIABILITY_UNVERIFIED');
});
test('Sybil clearance, immutable funding receipt, finality and recovery authority are hard gates',()=>{
  const cases=[
    [{missionFinalized:false},'MISSION_OR_SYBIL_UNRESOLVED'],
    [{sybilClear:false},'MISSION_OR_SYBIL_UNRESOLVED'],
    [{immutableReceiptAndInviteMatched:false},'RECEIPT_OR_INVITE_MISMATCH'],
    [{recoveryLedgerFullyVerified:false},'RECOVERY_AUTHORITY_UNVERIFIED'],
    [{physicalPoolEvidenceVerified:false},'POOL_OR_LIABILITY_UNVERIFIED'],
    [{alreadyFixedOrSettled:true},'ALREADY_FIXED_OR_SETTLED'],
    [{observedAt:'2026-11-04T00:40:00Z'},'STALE_CHAIN_OBSERVATION'],
    [{observedAt:'2026-11-04T01:02:00Z'},'STALE_CHAIN_OBSERVATION'],
    [{finalGrossQuoteWei:w(4)},'QUOTE_BELOW_PROMISED_GROSS'],
  ];
  for (const [options,status] of cases) {
    const x=run(fixture(options));
    assert.equal(x.status,status);
    assert.equal(x.simulatedNetPayableWei,null);
    assert.equal(x.authorizesHandoff,false);
  }
});
test('malformed Wei, missing flags, invalid timestamps and absent guarantee reject',()=>{
  for (const options of [
    {guaranteeGrossWei:'0'},{guaranteeGrossWei:'0.1'},
    {finalGrossQuoteWei:'-1'},{verifiedRecoveryOffsetWei:'1e18'},
    {physicalPoolWei:' 1'},{cohortUnconvertedGuaranteesWei:w(4)},
    {globalUnconvertedGuaranteesWei:'0'}, {missionFinalized:'true'},
    {observedAt:'2026-11-04'}, {evaluatedAt:'not a time'}
  ]) assert.throws(()=>run(fixture(options)));
});
test('up to 1000 simulated final quotes never authorize a real payout',()=>{
  for(let n=1;n<=1000;n++){
    const x=run(fixture({finalGrossQuoteWei:w(n+5),verifiedRecoveryOffsetWei:w(n),
      physicalPoolWei:w(60),cohortEffectiveBudgetWei:w(2000)}));
    assert.equal(x.status,'SIMULATION_FITS');
    assert.equal(x.globalPhysicalLiabilityBeforeWei,x.globalPhysicalLiabilityAfterWei);
    assert.equal(x.authorizesAdmission,false);
    assert.equal(x.writesPerformed,false);
  }
});
test('the prototype may not be imported by the active reward signer or Claim',()=>{
  const dirs=[
    '../src/lib/rewards/automaticRewardPayout.ts',
    '../src/lib/rewards/immediateClaimPayout.ts',
    '../src/lib/rewards/rewardReservation.ts',
    '../src/lib/rewards/rewardBoostReserveExecution.ts',
  ];
  for(const path of dirs){
    const body=readFileSync(new URL(path,import.meta.url),'utf8');
    assert.doesNotMatch(body,/rewardGrossNetHandoffShadow/);
  }
});
