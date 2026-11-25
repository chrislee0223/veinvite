import 'server-only';
import { ThorClient } from '@vechain/sdk-network';
import { readVeBetterRoundWindow } from '@/lib/vebetter/entryEligibility';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { missionAutoResetSchemaReady } from '@/lib/rewards/missionAutoResetRuntime';
import type { AttemptProofEvent, MissionAutoResetChainProgress } from '@/lib/rewards/missionAutoResetChainReader';

export type OriginalMissionWindow = {
  originalRoundId: number;
  expectedVoteRoundId: number;
  dappEndBlock: number;
  checkedThroughBlock: number;
  voteStartBlock: number | null;
  voteEndBlock: number | null;
  finalizedBlock: number;
};

const positive = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n > 0;

/** Separate gate until both the original and retry persistence/settlement
 * migrations are verified. Default off, including in preview deployments. */
export async function twoRoundMissionPolicyReady(): Promise<boolean> {
  if (!missionAutoResetSchemaReady()) return false;
  const { data, error } = await supabaseAdmin.rpc('read_mission_auto_reset_settings_v1');
  if (error || !data || typeof data.enabled !== 'boolean') {
    throw new Error('Mission policy DB gate unavailable');
  }
  // Keep the bounded policy during a pause of automatic reset writes.
  return data.twoRoundPolicyEnabled === true;
}

/** For an original, still-pending invitation with a durable entry binding.
 * Never infer a round from current wall time or from a user's cached vote.
 * Null is a historical/unbound case and must remain outside automatic resets.
 * Fail closed on incomplete chain provenance. */
export async function readOriginalMissionWindow({
  inviteCode, network, activationBlock,
}: {
  inviteCode: string; network: string; activationBlock: number;
}): Promise<OriginalMissionWindow | null> {
  const { data, error } = await supabaseAdmin.from('invitations')
    .select('reward_cohort_round_id,eligibility_check_id,activation_block')
    .eq('invite_code', inviteCode).eq('activation_network', network).maybeSingle();
  if (error || !data) throw new Error('Original mission entry binding unavailable');
  if (data.reward_cohort_round_id == null || data.eligibility_check_id == null) return null;
  const originalRoundId = Number(data.reward_cohort_round_id);
  const expectedVoteRoundId = originalRoundId + 1;
  if (!positive(originalRoundId) || !positive(expectedVoteRoundId) ||
      !positive(activationBlock) || Number(data.activation_block) !== activationBlock) {
    throw new Error('Invalid original mission binding');
  }
  const config = getVeBetterNetworkConfig();
  if (config.network !== network) throw new Error('Original mission network mismatch');
  const original = await readVeBetterRoundWindow({ roundId: originalRoundId });
  if (original.network !== network || activationBlock < original.voteStartBlock ||
      activationBlock > original.voteEndBlock) {
    throw new Error('Activation outside its verified mission round');
  }
  const next = original.currentRoundId >= expectedVoteRoundId
    ? await readVeBetterRoundWindow({ roundId: expectedVoteRoundId }) : null;
  if (next && (next.network !== network || next.voteStartBlock <= original.voteEndBlock)) {
    throw new Error('Original mission vote window invalid');
  }
  const thor = ThorClient.at(config.nodeUrl);
  const finalizedBlock = (await thor.blocks.getBlockCompressed('finalized'))?.number;
  if (!positive(finalizedBlock) || finalizedBlock < activationBlock) {
    throw new Error('Original mission finality unavailable');
  }
  return {
    originalRoundId, expectedVoteRoundId, dappEndBlock: original.voteEndBlock,
    checkedThroughBlock: Math.min(next?.voteEndBlock ?? original.voteEndBlock, finalizedBlock),
    voteStartBlock: next?.voteStartBlock ?? null,
    voteEndBlock: next?.voteEndBlock ?? null,
    finalizedBlock,
  };
}

/** Persist a chain-verified resolution using the service-owned RPC. The DB
 * independently validates event shapes, distinct apps, exact bounds and
 * finality. Never call for an unfinalized incomplete window. */
export async function recordTwoRoundResolution(network: string, code: string, proof: Pick<MissionAutoResetChainProgress,
  'dappRoundId' | 'attemptStartBlock' | 'dappRoundEndBlock' | 'voteRoundStartBlock' |
  'voteRoundEndBlock' | 'finalizedThroughBlock' | 'events' | 'voteCompleted'>) {
  if (proof.voteRoundStartBlock === null || proof.voteRoundEndBlock === null) {
    throw new Error('Full mission window bounds unavailable');
  }
  const { data, error } = await supabaseAdmin.rpc('record_mission_two_round_resolution_v1', {
    p_network: network, p_invite_code: code, p_dapp_round_id: proof.dappRoundId,
    p_start_block: proof.attemptStartBlock, p_dapp_end_block: proof.dappRoundEndBlock,
    p_vote_start_block: proof.voteRoundStartBlock, p_vote_end_block: proof.voteRoundEndBlock,
    p_finalized_block: proof.finalizedThroughBlock, p_events: proof.events,
  });
  if (error || data?.recorded !== true || data.complete !== proof.voteCompleted) {
    throw new Error('Mission resolution rejected: ' + (error?.message ?? data?.reason ?? 'proof mismatch'));
  }
}

export function originalProofEvent(event: {txId:string;blockNumber:number;txIndex:number;clauseIndex:number;blockTimestamp:number},
  eventType: AttemptProofEvent['event_type'], appId: string|null, amountWei: string|null, voteRoundId: number|null): AttemptProofEvent {
  return { event_type:eventType, app_id:appId, amount_wei:amountWei, vote_round_id:voteRoundId,
    tx_id:event.txId.toLowerCase(), block_number:event.blockNumber, tx_index:event.txIndex,
    clause_index:event.clauseIndex, block_timestamp:new Date(event.blockTimestamp*1000).toISOString() };
}
