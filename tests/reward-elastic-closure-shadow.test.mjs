import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateElasticClosure } from '../src/lib/rewards/rewardElasticClosureShadow.ts';
const B=10n**18n;
const w=(n)=> (BigInt(n)*B).toString();
const fixture=(x={})=>({
  availableWei:w(1469),floorWei:w(5),verifiedCount:1,
  terminalRejectedCount:0,unfinishedMissionCount:0,pendingReviewCount:0,
  futureFundedSeats:0,admissionClosed:true,evidenceVerified:true,...x,
});
test('one cleared participant may take entire sealed eligible budget',()=>{
  const x=simulateElasticClosure(fixture());
  assert.equal(x.status,'SETTLEABLE');
  assert.equal(x.finalAwardWei,w(1469));
  assert.equal(x.finalTotalWei,w(1469));
});
test('five terminal Sybil rejects do not block one eligible recipient',()=>{
  assert.equal(simulateElasticClosure(fixture({terminalRejectedCount:5})).finalAwardWei,w(1469));
});
test('unfinished, reviews, or future seats prevent final settlement',()=>{
  for(const x of [{unfinishedMissionCount:1},{pendingReviewCount:1},{futureFundedSeats:1}]){
    const v=simulateElasticClosure(fixture(x));
    assert.equal(v.status,'WAITING_FOR_TERMINAL_EVIDENCE');
    assert.equal(v.finalAwardWei,null);
  }
});
test('funded minimum fails closed if 1000 winners overwhelm funding',()=>{
  const x=simulateElasticClosure(fixture({verifiedCount:1000}));
  assert.equal(x.status,'UNDERFUNDED');
  assert.equal(x.finalAwardWei,null);
});
test('simulated conservation for 1 to 1000 winners',()=>{
  for(let n=1;n<=1000;n++){
    const x=simulateElasticClosure(fixture({verifiedCount:n}));
    if(x.status==='SETTLEABLE'){
      assert.ok(BigInt(x.finalTotalWei)<=BigInt(w(1469)));
      assert.ok(BigInt(x.finalAwardWei)>=BigInt(w(5)));
    } else assert.equal(x.status,'UNDERFUNDED');
  }
});
test('rejected-only cohort has no payees',()=>{
  const x=simulateElasticClosure(fixture({verifiedCount:0,terminalRejectedCount:3}));
  assert.equal(x.status,'CLOSED_NO_WINNERS');
  assert.equal(x.reservedFloorWei,'0');
});
test('malformed amounts or counts are rejected',()=>{
  assert.throws(()=>simulateElasticClosure(fixture({floorWei:'-1'})));
  assert.throws(()=>simulateElasticClosure(fixture({verifiedCount:0.5})));
  assert.throws(()=>simulateElasticClosure(fixture({payoutCapWei:w(1)})));
});
