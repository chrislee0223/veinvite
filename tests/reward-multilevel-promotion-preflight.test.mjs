import assert from 'node:assert/strict';
import test from 'node:test';
import {checkMultilevelPromotionPreflight} from '../src/lib/rewards/multilevelPromotionPreflight.ts';

const wallet='0x'+'1'.repeat(40);
const validReview={
  status:'REVIEW_REQUIRED',payable:false,
  source:'READ_ONLY_CHAIN_AND_LEGACY_CROSSCHECK_V1',
  network:'testnet',wallet,roundId:130,
  evidenceFingerprint:'e'.repeat(64),
  structurallyEligible:true,rejectionReasons:[],
  lineage:{wallet,eventBlock:345,
    ancestors:[{wallet:'0x'+'2'.repeat(40),active:true}],
    edgeIds:['canonical-original-sponsor'],disconnectedAtLevel:2},
};
const valid=()=>({
  network:'testnet',roundId:130,wallet,
  stagedChainFingerprint:'a'.repeat(64),
  rescannedChainFingerprint:'a'.repeat(64),
  originalReview:structuredClone(validReview),
  currentReview:structuredClone(validReview),
  canonicalChainAuthorityChecked:true,
  canonicalSybilAndIdentityChecked:true,
  canonicalInviteGraphChecked:true,
  independentFundingReconciled:true,
  officialRulebookClearanceVerified:true,
});

test('all reviewed sources still NEVER grant a financial permission',()=>{
  const result=checkMultilevelPromotionPreflight(valid());
  assert.deepEqual(result,{
    status:'REQUIRES_OPERATOR_REVIEW',
    payable:false,roundId:130,reasons:[],
    nextAction:'MANUAL_SECURITY_SIGNOFF',
  });
});

test('unverified official compliance clearance is always blocking',()=>{
  const result=checkMultilevelPromotionPreflight({
    ...valid(),officialRulebookClearanceVerified:false,
  });
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.payable,false);
  assert.ok(result.reasons.includes('RULEBOOK_CLEARANCE_REQUIRED'));
  assert.equal(result.nextAction,'RESOLVE_RULEBOOK_AND_FUNDING');
});

test('funding estimate is not sufficient as reserved proof',()=>{
  const x=checkMultilevelPromotionPreflight({
    ...valid(),independentFundingReconciled:false,
  });
  assert.ok(x.reasons.includes('ACTUAL_B3TR_FUNDING_RECONCILIATION_MISSING'));
  assert.equal(x.status,'BLOCKED');
});

test('late Sybil invalidation and new parent require another review',()=>{
  const now=structuredClone(validReview);
  now.structurallyEligible=false;
  now.rejectionReasons=['LEGACY_HISTORICALLY_INVALIDATED'];
  now.evidenceFingerprint='f'.repeat(64);
  const sybil=checkMultilevelPromotionPreflight({...valid(),currentReview:now});
  assert.equal(sybil.status,'BLOCKED');
  assert.ok(sybil.reasons.some(s=>s.includes('EVIDENCE_OR_SYBIL_REVISION_CHANGED')));
  const reparent=structuredClone(validReview);
  reparent.lineage.ancestors[0].wallet='0x'+'3'.repeat(40);
  assert.equal(checkMultilevelPromotionPreflight({...valid(),currentReview:reparent}).status,'BLOCKED');
});

test('cross-network, changed onchain source and invalid wallet all blocked',()=>{
  assert.deepEqual(checkMultilevelPromotionPreflight({
    ...valid(),network:'mainnet',
  }).reasons,['INVALID_OR_CROSS_NETWORK_SOURCE']);
  const changed=checkMultilevelPromotionPreflight({
    ...valid(),rescannedChainFingerprint:'b'.repeat(64),
  });
  assert.ok(changed.reasons.includes('CHAIN_EVIDENCE_CHANGED_AFTER_REVIEW'));
  assert.equal(checkMultilevelPromotionPreflight({...valid(),wallet:'bad'}).status,'BLOCKED');
});

test('caller-supplied missing independent attestations cannot grant payout',()=>{
  const x=checkMultilevelPromotionPreflight({
    ...valid(),canonicalChainAuthorityChecked:false,
    canonicalSybilAndIdentityChecked:false,
    canonicalInviteGraphChecked:false,
  });
  assert.ok(x.reasons.includes('INDEPENDENT_CHAIN_FINALITY_MISSING'));
  assert.ok(x.reasons.includes('CURRENT_SYBIL_IDENTITY_ATTESTATION_MISSING'));
  assert.ok(x.reasons.includes('IMMUTABLE_REFERRAL_PROVENANCE_MISSING'));
  assert.equal(x.payable,false);
});
