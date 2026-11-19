/**
 * Pure five-level REFERRAL ancestor snapshot. Not network UI binary placement.
 *
 * Input edges must originate from a trusted, Sybil-filtered, immutable
 * referral-history source; this function cannot authenticate those facts.
 * A later reparenting must NOT change who was upstream at an earlier event.
 * Recipient status is explicitly tied to the earning round's independently
 * verified active-wallet snapshot; presence in the graph alone is insufficient.
 */
import type { VerifiedUpline } from './multilevelRewardPolicy';

export type TrustedReferralEdge = {
  edgeId: string;
  network: string;
  childWallet: string;
  sponsorWallet: string;
  effectiveBlock: number;
};

export type FiveLevelSnapshot = {
  wallet: string;
  eventBlock: number;
  ancestors: VerifiedUpline[];
  /** Exact edge identifiers used at this event cutoff. */
  edgeIds: string[];
  disconnectedAtLevel: number | null;
};

const WALLET=/^0x[0-9a-f]{40}$/;
const EDGE_ID=/^[A-Za-z0-9_:.-]{1,128}$/;
const validBlock=(x:number):boolean=>Number.isSafeInteger(x)&&x>=1;
function wallet(raw:string):string {
  if(typeof raw!=='string'||!WALLET.test(raw.toLowerCase())) {
    throw new Error('INVALID_REFERRAL_WALLET');
  }
  return raw.toLowerCase();
}

/** Earliest-to-latest edge evolution, held at the exact settlement event block. */
export function buildFiveLevelUplineSnapshot(input:{
  wallet:string;
  network:'mainnet'|'testnet'|'testnet-staging';
  eventBlock:number;
  edges:readonly TrustedReferralEdge[];
  roundActiveWallets:ReadonlySet<string>;
}):FiveLevelSnapshot {
  const subject=wallet(input.wallet);
  if(!['mainnet','testnet','testnet-staging'].includes(input.network) ||
     !validBlock(input.eventBlock) || !Array.isArray(input.edges) ||
     input.edges.length>100000 ||
     !(input.roundActiveWallets instanceof Set)) {
    throw new Error('INVALID_REFERRAL_SNAPSHOT_INPUT');
  }
  const active=new Set<string>();
  for(const member of input.roundActiveWallets) active.add(wallet(member));
  const byChild=new Map<string,TrustedReferralEdge>();
  const edgeIds=new Set<string>();

  for(const item of input.edges) {
    if(!item || !EDGE_ID.test(item.edgeId) ||
      item.network!==input.network || !validBlock(item.effectiveBlock)) {
      throw new Error('UNTRUSTED_REFERRAL_EDGE');
    }
    if(edgeIds.has(item.edgeId)) throw new Error('DUPLICATED_REFERRAL_EDGE_ID');
    edgeIds.add(item.edgeId);
    const child=wallet(item.childWallet);
    const sponsor=wallet(item.sponsorWallet);
    if(child===sponsor) throw new Error('CYCLIC_REFERRAL_GRAPH');
    if(item.effectiveBlock>input.eventBlock)continue;
    const edge={...item,childWallet:child,sponsorWallet:sponsor};
    const prev=byChild.get(child);
    if(!prev || edge.effectiveBlock>prev.effectiveBlock) {
      byChild.set(child,edge);
    } else if(edge.effectiveBlock===prev.effectiveBlock &&
      (prev.sponsorWallet!==sponsor || prev.edgeId!==item.edgeId)) {
      throw new Error('AMBIGUOUS_SAME_BLOCK_REFERRAL_PARENT');
    }
  }

  const ancestors:VerifiedUpline[]=[];
  const walkedEdges:string[]=[];
  const visited=new Set<string>([subject]);
  let current=subject;
  let disconnectedAtLevel:number|null=null;

  for(let level=1;level<=5;level++) {
    const edge=byChild.get(current);
    if(!edge){
      ancestors.push({wallet:null,active:false});
      if(disconnectedAtLevel===null)disconnectedAtLevel=level;
      continue;
    }
    if(visited.has(edge.sponsorWallet)) {
      throw new Error('CYCLIC_REFERRAL_GRAPH');
    }
    visited.add(edge.sponsorWallet);
    walkedEdges.push(edge.edgeId);
    ancestors.push({
      wallet:edge.sponsorWallet,
      active:active.has(edge.sponsorWallet),
    });
    current=edge.sponsorWallet;
  }
  return {
    wallet:subject,eventBlock:input.eventBlock,ancestors,
    edgeIds:walkedEdges,disconnectedAtLevel,
  };
}
