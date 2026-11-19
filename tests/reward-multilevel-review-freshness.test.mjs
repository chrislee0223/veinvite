import assert from 'node:assert/strict';
import test from 'node:test';
import {checkMultilevelReviewFreshness} from '../src/lib/rewards/multilevelReviewFreshness.ts';

const wallet=n=>'0x'+n.toString(16).padStart(40,'0');
const base={
  status:'REVIEW_REQUIRED',payable:false,
  source:'READ_ONLY_ONBOARDING_CROSSCHECK_V1',
  network:'testnet',wallet:wallet(1),roundId:130,
  directInviterWallet:wallet(2),
  structurallyEligible:true,rejectionReasons:[],
  evidenceFingerprint:'a'.repeat(64),
  lineage:{
    wallet:wallet(1),eventBlock:200,
    ancestors:[{wallet:wallet(2),active:false}],
    edgeIds:['original-invitation'],disconnectedAtLevel:2,
  },
};
const clone=x=>JSON.parse(JSON.stringify(x));

test('identical trusted snapshots remain nonpayable even when unchanged',()=>{
  assert.deepEqual(checkMultilevelReviewFreshness(base,clone(base)),{
    status:'MATCHED_REVIEW_ONLY',payable:false,reasons:[],
  });
});

test('later Sybil revision, invalidation, or wallet recheck always blocks',()=>{
  const newer={...clone(base),evidenceFingerprint:'b'.repeat(64)};
  const a=checkMultilevelReviewFreshness(base,newer);
  assert.equal(a.status,'RECHECK_REQUIRED');
  assert.ok(a.reasons.includes('EVIDENCE_OR_SYBIL_REVISION_CHANGED'));
  newer.structurallyEligible=false;
  newer.rejectionReasons=['CURRENT_SYBIL_OR_IDENTITY_NOT_CLEAR'];
  const b=checkMultilevelReviewFreshness(base,newer);
  assert.ok(b.reasons.includes('ELIGIBILITY_REVOKED_OR_UNVERIFIED'));
});

test('a reparented ancestor or changed historical edge must be reviewed',()=>{
  const x=clone(base);
  x.lineage.ancestors[0].wallet=wallet(8);
  const verdict=checkMultilevelReviewFreshness(base,x);
  assert.equal(verdict.status,'RECHECK_REQUIRED');
  assert.ok(verdict.reasons.includes('UPLINE_SNAPSHOT_CHANGED'));
  const second=clone(base);
  second.lineage.edgeIds=['changed-edge'];
  assert.equal(checkMultilevelReviewFreshness(base,second).status,
    'RECHECK_REQUIRED');
});

test('mixing onboarding and ongoing-activity review is always rejected',()=>{
  const x={...clone(base),source:'READ_ONLY_CHAIN_AND_LEGACY_CROSSCHECK_V1'};
  assert.ok(checkMultilevelReviewFreshness(base,x).reasons
    .includes('IDENTITY_OR_MISSION_KIND_CHANGED'));
  const changed={...clone(base),wallet:wallet(9)};
  assert.equal(checkMultilevelReviewFreshness(base,changed).status,
    'RECHECK_REQUIRED');
});

test('missing record, malformed fingerprint, attempted payable state fail closed',()=>{
  const malformed={...clone(base),evidenceFingerprint:'invalid'};
  assert.equal(checkMultilevelReviewFreshness(malformed,malformed).status,
    'RECHECK_REQUIRED');
  const payable={...clone(base),payable:true};
  assert.equal(checkMultilevelReviewFreshness(base,payable).status,
    'RECHECK_REQUIRED');
  assert.equal(checkMultilevelReviewFreshness(null,clone(base)).status,
    'RECHECK_REQUIRED');
});
