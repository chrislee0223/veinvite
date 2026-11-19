/**
 * Pure, deterministic, strictly typed bridge from the agreed calculator to
 * the PRIVATE PREVIEW atomic rehearsal SQL. No DB, external RPC or signer.
 *
 * A matching manifest is not evidence that the source events are authentic:
 * the database requires the complete matching, immutable verified-event set
 * and reruns all amounts/recipients/carry/dust before sealing.
 */
import {
  calculateMultilevelRound,
  type MultilevelRoundInput,
  type MultilevelRoundResult,
} from './multilevelRewardPolicy.ts';

export type MultilevelSettlementManifest = MultilevelRoundResult & {
  participantPoolWei:string;
  previousCategoryCarryWei:{onboarding:string;active:string;leader:string};
  qualifiedEvents:Array<{
    kind:'ONBOARDING'|'ACTIVE';
    eventId:string;
    actorWallet:string;
    proofId:string;
  }>;
};

/**
 * The manifest intentionally contains NO production network, no authorization
 * status and no private key. Only the separately gated preview DB bridge may
 * rehearse it. The caller's proofIds must exactly match staged, reviewed
 * verified_events.identity_clearance_ref rows.
 */
export function buildMultilevelSettlementManifest(
  input:MultilevelRoundInput,
):MultilevelSettlementManifest {
  const result=calculateMultilevelRound(input);
  const qualifiedEvents:MultilevelSettlementManifest['qualifiedEvents']=[
    ...input.onboardingEvents.map(x=>({
      kind:'ONBOARDING' as const,eventId:x.eventId,
      actorWallet:x.actorWallet.toLowerCase(),proofId:x.proofId,
    })),
    ...input.activeEvents.map(x=>({
      kind:'ACTIVE' as const,eventId:x.eventId,
      actorWallet:x.actorWallet.toLowerCase(),proofId:x.proofId,
    })),
  ].sort((a,b)=>
    a.kind.localeCompare(b.kind) ||
    a.eventId.localeCompare(b.eventId) ||
    a.actorWallet.localeCompare(b.actorWallet)
  );
  const prev=input.previousCategoryCarryWei??{};
  return {
    ...result,
    participantPoolWei:input.participantPoolWei,
    previousCategoryCarryWei:{
      onboarding:prev.onboarding??'0',
      active:prev.active??'0',
      leader:prev.leader??'0',
    },
    qualifiedEvents,
  };
}
