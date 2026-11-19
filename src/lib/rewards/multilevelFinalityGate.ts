/**
 * Independent consensus-finality barrier for observed VeChainThor rounds.
 * A 24-block confirmation is NOT finality. The node's explicit FINAL block
 * must be at/after both round boundaries before even a nonpayable
 * verification candidate may be considered structurally eligible.
 *
 * This is a single-provider finality attestation, NOT a cross-node proof or
 * a financial payout authorization.
 */
export type FinalizedBlockObservation = {
  finalBlockId:string;
  finalizedThroughBlock:number;
  bestBlock:number;
  dappRoundEndBlock:number;
  voteRoundEndBlock:number;
};
export type FinalityGateResult =
 | {ok:true}
 | {ok:false;reason:
   'INVALID_FINALITY_OBSERVATION'|
   'FINAL_BLOCK_AHEAD_OF_BEST'|
   'ROUND_NOT_FINALIZED'};

const block=(x:number):boolean=>Number.isSafeInteger(x)&&x>=1;
const ID=/^0x[0-9a-f]{64}$/;

export function checkMultilevelFinalityGate(
  a:FinalizedBlockObservation,
):FinalityGateResult {
  if(!a || typeof a.finalBlockId!=='string' ||
    !ID.test(a.finalBlockId.toLowerCase()) ||
    !block(a.finalizedThroughBlock) || !block(a.bestBlock) ||
    !block(a.dappRoundEndBlock) || !block(a.voteRoundEndBlock)) {
    return {ok:false,reason:'INVALID_FINALITY_OBSERVATION'};
  }
  if(a.finalizedThroughBlock>a.bestBlock) {
    return {ok:false,reason:'FINAL_BLOCK_AHEAD_OF_BEST'};
  }
  if(a.finalizedThroughBlock<a.dappRoundEndBlock ||
    a.finalizedThroughBlock<a.voteRoundEndBlock) {
    return {ok:false,reason:'ROUND_NOT_FINALIZED'};
  }
  return {ok:true};
}
