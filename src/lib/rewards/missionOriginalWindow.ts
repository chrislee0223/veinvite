import 'server-only';
import { ThorClient } from '@vechain/sdk-network';
import { readVeBetterRoundWindow } from '@/lib/vebetter/entryEligibility';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';
import { supabaseAdmin } from '@/lib/supabaseServer';

export type OriginalMissionWindow = {
  originalRoundId: number;
  expectedVoteRoundId: number;
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
  if (process.env.VEINVITE_MISSION_TWO_ROUND_READY !== 'true') return false;
  const { data, error } = await supabaseAdmin.rpc('read_mission_auto_reset_settings_v1');
  if (error || !data || typeof data.enabled !== 'boolean') {
    throw new Error('Mission policy DB gate unavailable');
  }
  return data.enabled === true;
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
    originalRoundId, expectedVoteRoundId,
    checkedThroughBlock: Math.min(next?.voteEndBlock ?? original.voteEndBlock, finalizedBlock),
    voteStartBlock: next?.voteStartBlock ?? null,
    voteEndBlock: next?.voteEndBlock ?? null,
    finalizedBlock,
  };
}
