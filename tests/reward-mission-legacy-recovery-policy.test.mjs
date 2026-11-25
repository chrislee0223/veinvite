import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planLegacyRecovery as plan} from '../src/lib/rewards/missionLegacyRecoveryPolicy.ts';
const base={activationBlock:25737519,fundingRoundId:114,bindingSource:'BOOTSTRAP_CARRY_FORWARD',hasEntryProof:true,slotReleased:false,protectedHistory:false,currentRoundId:126,firstAutomaticRoundId:126,rounds:[{roundId:113,startBlock:25702360,endBlock:25762839},{roundId:114,startBlock:25762841,endBlock:25823320}]};
test('carry-forward keeps funding cohort and plans both historical windows',()=>{
 for(const activationBlock of [25737519,25737605]){
 assert.deepEqual(plan({...base,activationBlock}),{state:'REQUIRES_CHAIN_RECONCILIATION',entryRoundId:113,fundingRoundId:114,targetRoundId:126,windows:[{roundId:113,voteRoundId:114},{roundId:114,voteRoundId:115}]});
 }
});
test('valid expired round is not forgotten or exempted',()=>{
 assert.deepEqual(plan({...base,activationBlock:25788091,bindingSource:'ROUND_MATCH'}),{state:'REQUIRES_CHAIN_RECONCILIATION',entryRoundId:114,fundingRoundId:114,targetRoundId:126,windows:[{roundId:114,voteRoundId:115}]});
});
test('released slots and historic completed evidence are not automatically reopened',()=>{
 assert.equal(plan({...base,slotReleased:true}).state,'PROTECTED_HISTORY_REVIEW');
 assert.equal(plan({...base,protectedHistory:true}).state,'PROTECTED_HISTORY_REVIEW');
});
test('missing proof, conflicting windows and unexplained mismatch stay blocked',()=>{
 assert.equal(plan({...base,hasEntryProof:false}).state,'ENTRY_PROOF_REVIEW');
 assert.equal(plan({...base,rounds:[]}).state,'ROUND_PROOF_REVIEW');
 assert.equal(plan({...base,bindingSource:'ROUND_MATCH'}).state,'ROUND_PROOF_REVIEW');
 assert.equal(plan({...base,rounds:[...base.rounds,base.rounds[0]]}).state,'ROUND_PROOF_REVIEW');
});
test('active original window must not expire early',()=>{
 assert.equal(plan({...base,currentRoundId:115}).state,'ORIGINAL_WINDOW_PROTECTED');
 assert.equal(plan({...base,currentRoundId:116}).state,'NOT_YET_EXPIRED');
});
