import assert from 'node:assert/strict';
import test from 'node:test';
import {buildMultilevelSettlementManifest} from '../src/lib/rewards/multilevelSettlementManifest.ts';

const w=n=>'0x'+n.toString(16).padStart(40,'0');
const onboarding={
  eventId:'new_1',actorWallet:w(1),proofId:'clearance-proof-on',
  uplines:[{wallet:w(2),active:false},{wallet:w(3),active:true}],
};
const active={
  eventId:'active_1',actorWallet:w(7),proofId:'clearance-proof-active',
  uplines:[{wallet:w(2),active:true},{wallet:w(3),active:false}],
};
const input=(overrides={})=>({
  roundId:130,participantPoolWei:'1000',
  onboardingEvents:[onboarding],activeEvents:[active],...overrides,
});

test('manifest maps calculator into canonical exact-Wei preview SQL schema',()=>{
  const result=buildMultilevelSettlementManifest(input());
  assert.equal(result.roundId,130);
  assert.deepEqual(result.budgetByCategoryWei,
    {onboarding:'600',active:'300',leader:'100'});
  assert.deepEqual(result.previousCategoryCarryWei,
    {onboarding:'0',active:'0',leader:'0'});
  assert.deepEqual(result.qualifiedEvents,[
    {kind:'ACTIVE',eventId:'active_1',actorWallet:w(7),proofId:'clearance-proof-active'},
    {kind:'ONBOARDING',eventId:'new_1',actorWallet:w(1),proofId:'clearance-proof-on'},
  ]);
  const payout=result.entitlements.reduce((sum,e)=>sum+BigInt(e.grossWei),0n);
  const returned=result.generalReturnDetails.reduce((sum,e)=>sum+BigInt(e.amountWei),0n);
  const carry=Object.values(result.categoryCarryNextWei).reduce((sum,v)=>sum+BigInt(v),0n);
  assert.equal(payout+returned+carry,1000n);
  for(const p of result.entitlements){
    assert.equal(BigInt(p.baseClaimWei)+BigInt(p.xShareHeldWei),BigInt(p.grossWei));
    assert.equal(BigInt(p.xShareHeldWei),BigInt(p.grossWei)/10n);
  }
});

test('same wallet cannot create onboarding and active network reward in same round',()=>{
  assert.throws(()=>buildMultilevelSettlementManifest(input({
    activeEvents:[{...active,actorWallet:w(1)}],
  })),/DUPLICATE_ACTOR_IN_ROUND/);
});

test('invalid pool and upstream cycles fail before reaching any private DB',()=>{
  assert.throws(()=>buildMultilevelSettlementManifest(input({
    participantPoolWei:'-1',
  })),/INVALID_EXACT_WEI/);
  assert.throws(()=>buildMultilevelSettlementManifest(input({
    onboardingEvents:[{...onboarding,uplines:[{wallet:w(1),active:true}]}],
  })),/CYCLIC_OR_DUPLICATE_UPLINE/);
});

test('manifest never adds another operation fee or X bonus above earned budget',()=>{
  const m=buildMultilevelSettlementManifest(input());
  assert.equal(m.totalBudgetWei,'1000');
  assert.equal(m.grossEntitlementsWei,
    m.entitlements.reduce((sum,v)=>sum+BigInt(v.grossWei),0n).toString());
});
