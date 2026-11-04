import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideUnifiedXHold,
  X_POST_WINDOW_MS,
  X_RETAIN_WINDOW_MS,
  X_SUBMISSION_GRACE_MS,
} from '../src/lib/rewards/unifiedXPromotionLifecycle.ts';

const H=3600000, O=1_000_000_000;
const base = {
  totalRewardWei:(150n*10n**18n).toString(),
  nowMs:O,
  offerOpenedAtMs:null,
  postCreatedAtMs:null,
  submittedAtMs:null,
  initialVerifiedAtMs:null,
  finalVerifiedAtMs:null,
  pendingVerification:false,
  initialProofValid:false,
  finalProofValid:false,
  sybilStillClear:true,
  securityInvalidated:false,
  transferSigned:false,
  transferPaidOnchain:false,
};
function decide(override={}){return decideUnifiedXHold({...base,...override});}

test('fixed total 150 produces hold of 10, never additive 160',()=>{
  assert.deepEqual(decide(),{action:'HOLD',holdWei:(10n*10n**18n).toString(),reason:'BASE_PAYOUT_NOT_READY'});
});
test('a total at or below 10 B3TR cannot open X hold',()=>{
  for(const n of [1n,10n]){
    assert.equal(decide({totalRewardWei:(n*10n**18n).toString()}).action,'NOT_OFFERED');
  }
});
test('offer 24 hours starts after base payout, not at round cutoff',()=>{
  assert.equal(decide({offerOpenedAtMs:O,nowMs:O+X_POST_WINDOW_MS}).action,'HOLD');
});
test('no post after 24h plus ingestion grace releases',()=>{
  assert.equal(decide({offerOpenedAtMs:O,nowMs:O+X_POST_WINDOW_MS+X_SUBMISSION_GRACE_MS+1}).action,'RELEASE');
});
test('a post 1ms after 24h deadline releases even if submitted',()=>{
  assert.equal(decide({offerOpenedAtMs:O,nowMs:O+X_POST_WINDOW_MS+X_SUBMISSION_GRACE_MS,postCreatedAtMs:O+X_POST_WINDOW_MS+1,submittedAtMs:O+X_POST_WINDOW_MS+1}).action,'RELEASE');
});
test('posted within 24h and submitted within 15m grace survives verification delays',()=>{
  const t=decide({offerOpenedAtMs:O,nowMs:O+X_POST_WINDOW_MS+X_SUBMISSION_GRACE_MS+3*H,postCreatedAtMs:O+X_POST_WINDOW_MS,submittedAtMs:O+X_POST_WINDOW_MS+X_SUBMISSION_GRACE_MS,pendingVerification:true});
  assert.equal(t.action,'HOLD');
  assert.equal(t.reason,'PENDING_INITIAL_POST_VERIFICATION');
});
test('verified within 24h retains hold for another 24 hours',()=>{
  const t=decide({offerOpenedAtMs:O,nowMs:O+48*H,postCreatedAtMs:O+H,submittedAtMs:O+H,initialVerifiedAtMs:O+2*H,initialProofValid:true});
  assert.equal(t.action,'HOLD');
  assert.equal(t.reason,'WAITING_FINAL_POST_RECHECK');
});
test('final post proof only ready when 24h after initial verification',()=>{
  const proof={offerOpenedAtMs:O,nowMs:O+27*H,postCreatedAtMs:O+H,submittedAtMs:O+H,initialVerifiedAtMs:O+2*H,initialProofValid:true,finalProofValid:true};
  assert.throws(()=>decide({...proof,finalVerifiedAtMs:O+25*H}),/FINAL_24H_RETENTION_NOT_PROVEN/);
  assert.equal(decide({...proof,finalVerifiedAtMs:O+26*H}).action,'READY_TO_SIGN');
});
test('deleted or invalid proof releases unless a transfer was already signed',()=>{
  assert.equal(decide({offerOpenedAtMs:O,securityInvalidated:true}).action,'RELEASE');
  assert.equal(decide({offerOpenedAtMs:O,securityInvalidated:true,transferSigned:true}).action,'SIGNED_PENDING_RECONCILIATION');
});
test('signed promotion must be reconciled and paid, not recycled',()=>{
  assert.equal(decide({transferSigned:true}).action,'SIGNED_PENDING_RECONCILIATION');
  assert.equal(decide({transferSigned:true,transferPaidOnchain:true}).action,'PAID');
  assert.throws(()=>decide({transferPaidOnchain:true}),/PAID_WITHOUT_SIGNED/);
});
test('malformed/tampered proof timelines fail closed',()=>{
  assert.throws(()=>decide({nowMs:-10}),/CURRENT_TIME/);
  assert.throws(()=>decide({offerOpenedAtMs:O+H}),/OFFER_IN_FUTURE/);
  assert.throws(()=>decide({initialVerifiedAtMs:O+H}),/PROOF_BEFORE_OFFER/);
  assert.throws(()=>decide({offerOpenedAtMs:O,postCreatedAtMs:O+H,submittedAtMs:O+H,initialVerifiedAtMs:O+2*H,finalVerifiedAtMs:O+30*H}),/FINAL_24H_RETENTION_NOT_PROVEN|FINAL_POST_PROOF_INVALID/);
});
test('post existing with no submission still expires at end of grace',()=>{
  assert.equal(decide({offerOpenedAtMs:O,nowMs:O+X_POST_WINDOW_MS+X_SUBMISSION_GRACE_MS+1,postCreatedAtMs:O+H}).action,'RELEASE');
});
test('no offer created if <=10 B3TR, even with old X evidence',()=>{
  assert.throws(()=>decide({totalRewardWei:(10n*10n**18n).toString(),transferSigned:true}),/SMALL_REWARD_UNEXPECTED/);
});
