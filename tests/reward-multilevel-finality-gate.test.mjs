import assert from 'node:assert/strict';
import test from 'node:test';
import {checkMultilevelFinalityGate} from '../src/lib/rewards/multilevelFinalityGate.ts';
const base={finalBlockId:'0x'+'a'.repeat(64),finalizedThroughBlock:300,
  bestBlock:340,dappRoundEndBlock:199,voteRoundEndBlock:299};
test('a genuine FINAL-revision block covering both windows passes',()=>{
  assert.deepEqual(checkMultilevelFinalityGate(base),{ok:true});
  assert.deepEqual(checkMultilevelFinalityGate({...base,finalizedThroughBlock:299}),{ok:true});
});
test('24+ best-block depth does not override absent consensus finality',()=>{
  const x={...base,finalizedThroughBlock:280,bestBlock:500};
  assert.deepEqual(checkMultilevelFinalityGate(x),
    {ok:false,reason:'ROUND_NOT_FINALIZED'});
  assert.deepEqual(checkMultilevelFinalityGate({...base,finalizedThroughBlock:198}),
    {ok:false,reason:'ROUND_NOT_FINALIZED'});
});
test('forged, unavailable or ahead-of-head FINAL revision fails closed',()=>{
  assert.deepEqual(checkMultilevelFinalityGate({...base,finalBlockId:''}),
    {ok:false,reason:'INVALID_FINALITY_OBSERVATION'});
  assert.deepEqual(checkMultilevelFinalityGate({...base,finalizedThroughBlock:NaN}),
    {ok:false,reason:'INVALID_FINALITY_OBSERVATION'});
  assert.deepEqual(checkMultilevelFinalityGate({...base,finalizedThroughBlock:341}),
    {ok:false,reason:'FINAL_BLOCK_AHEAD_OF_BEST'});
});
