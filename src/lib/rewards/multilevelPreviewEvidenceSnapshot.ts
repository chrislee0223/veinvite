/** Deterministic non-financial Thor observation snapshot for PREVIEW ONLY. */
import { createHash } from 'node:crypto';
import type { MultilevelChainScan } from './multilevelChainEvidenceReader';

export function stableMultilevelChainObservation(chain:MultilevelChainScan) {
  return {
    authority:chain.authority,
    network:chain.network,
    wallet:chain.wallet,
    kind:chain.kind,
    earningRoundId:chain.earningRoundId,
    dappRoundId:chain.dappRoundId,
    dappWindow:chain.dappWindow,
    voteWindow:chain.voteWindow,
    maturityDepthBlocks:chain.maturityDepthBlocks,
    activationBlock:chain.activationBlock??null,
    conversion:chain.conversion,
    verdict:chain.verdict,
    rewardedDapps:chain.rewardedDapps,
    votes:chain.votes,
  };
}

/**
 * Stable across changing bestBlock height for an immutable closed round.
 * When the facts change, hash changes and preview DB refuses replacement.
 */
export function fingerprintMultilevelChainObservation(
  chain:MultilevelChainScan,
):string {
  return createHash('sha256')
    .update(JSON.stringify(stableMultilevelChainObservation(chain))).digest('hex');
}
