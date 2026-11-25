/**
 * Staged legacy recovery preflight. This does not authorize a reset or a payout.
 * All round windows and finality must be fetched and verified on the same chain.
 * A funding cohort is immutable; never reinterpret it as the entry round.
 */
export type VerifiedRound = { roundId:number; startBlock:number; endBlock:number };
type RecoveryInput = {
  activationBlock:number|null; fundingRoundId:number|null; bindingSource:string|null;
  hasEntryProof:boolean; slotReleased:boolean; protectedHistory:boolean;
  currentRoundId:number; firstAutomaticRoundId:number;
  rounds:readonly VerifiedRound[];
};
const positive=(n:number|null):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
export function planLegacyRecovery(i:RecoveryInput) {
  if(i.protectedHistory||i.slotReleased) return {state:'PROTECTED_HISTORY_REVIEW'} as const;
  if(!positive(i.activationBlock)||!positive(i.fundingRoundId)||!i.hasEntryProof) return {state:'ENTRY_PROOF_REVIEW'} as const;
  if(!positive(i.currentRoundId)||!positive(i.firstAutomaticRoundId)||i.currentRoundId<i.fundingRoundId) return {state:'ROUND_PROOF_REVIEW'} as const;
  const rounds=[...i.rounds].sort((a,b)=>a.roundId-b.roundId);
  if(rounds.some((r,k)=>!positive(r.roundId)||!positive(r.startBlock)||!positive(r.endBlock)||r.endBlock<r.startBlock||
    (k>0&&(r.roundId===rounds[k-1].roundId||r.startBlock<=rounds[k-1].endBlock)))) return {state:'ROUND_PROOF_REVIEW'} as const;
  const actual=rounds.filter(r=>r.startBlock<=i.activationBlock!&&i.activationBlock!<=r.endBlock);
  if(actual.length!==1) return {state:'ROUND_PROOF_REVIEW'} as const;
  const entry=actual[0].roundId, funding=i.fundingRoundId;
  if(entry!==funding&&(i.bindingSource!=='BOOTSTRAP_CARRY_FORWARD'||entry>=funding)) return {state:'ROUND_PROOF_REVIEW'} as const;
  const lastOriginalRound=Math.max(entry,funding)+1;
  if(!positive(lastOriginalRound)||i.currentRoundId<=lastOriginalRound) return {state:'ORIGINAL_WINDOW_PROTECTED'} as const;
  const first=Math.max(lastOriginalRound+1,i.firstAutomaticRoundId);
  if(!positive(first)||i.currentRoundId<first) return {state:'NOT_YET_EXPIRED'} as const;
  const target=first+2*Math.floor((i.currentRoundId-first)/2);
  if(!positive(target)||!positive(target+1)) return {state:'ROUND_PROOF_REVIEW'} as const;
  // Protect every possible original completion window, including the
  // carry-forward funding window. Never interpret a missing scan as absence.
  const windows=[...new Set([entry,funding])].map(roundId=>({roundId,voteRoundId:roundId+1}));
  return {state:'REQUIRES_CHAIN_RECONCILIATION',entryRoundId:entry,fundingRoundId:funding,targetRoundId:target,windows} as const;
}
