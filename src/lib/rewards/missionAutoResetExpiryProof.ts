import { readMissionAutoResetChainProgress, type MissionAutoResetChainProgress } from '@/lib/rewards/missionAutoResetChainReader';
import { ABIEvent } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';

import {
  readVeBetterRoundWindow,
} from '@/lib/vebetter/entryEligibility';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

/**
 * Before resetting an expired attempt, prove the previous voting window is
 * FINALIZED and contains no vote from this invitee. This is deliberately
 * more conservative than mission validation: ANY vote holds the reset for
 * reconciliation/security review, even if other checkpoints are incomplete.
 *
 * Never turn an RPC/indexer failure into a "no vote" result.
 */
const voteCast = new ABIEvent(
  'event AllocationVoteCast(address indexed voter, uint256 indexed roundId, bytes32[] appsIds, uint256[] voteWeights)',
);

export type MissionPreviousVoteWindowEvidence =
  | { outcome: 'SAFE_TO_RESET'; voteRoundId: number;
      roundEndBlock: number; finalizedBlock: number }
  | { outcome: 'VOTE_PROOF_PENDING' | 'VOTE_WINDOW_NOT_FINALIZED';
      voteRoundId: number; roundEndBlock: number; finalizedBlock: number };

export async function verifyPreviousMissionVoteWindow({
  walletAddress,
  expectedNetwork,
  voteRoundId,
  minFinalityBlocks = 12,
}: {
  walletAddress: string;
  expectedNetwork: string;
  voteRoundId: number;
  minFinalityBlocks?: number;
}): Promise<MissionPreviousVoteWindowEvidence> {
  if (!/^0x[0-9a-f]{40}$/i.test(walletAddress) ||
      !Number.isSafeInteger(voteRoundId) || voteRoundId < 1 ||
      !Number.isSafeInteger(minFinalityBlocks) ||
      minFinalityBlocks < 12 || minFinalityBlocks > 10000) {
    throw new Error('Invalid mission expiry verification input.');
  }

  const config = getVeBetterNetworkConfig();
  if (config.network !== expectedNetwork) {
    throw new Error('Mission expiry verification network mismatch.');
  }

  const window = await readVeBetterRoundWindow({ roundId: voteRoundId });
  if (window.network !== expectedNetwork ||
      window.voteStartBlock < 1 ||
      window.voteEndBlock < window.voteStartBlock) {
    throw new Error('Previous vote window chain boundaries were not verified.');
  }

  const thor = ThorClient.at(config.nodeUrl);
  const finalized = await thor.blocks.getBlockCompressed('finalized');
  const finalizedBlock = finalized?.number;
  if (typeof finalizedBlock !== 'number' ||
      !Number.isSafeInteger(finalizedBlock) || finalizedBlock < 1) {
    throw new Error('Finalized VeChain block unavailable during mission reset.');
  }

  if (finalizedBlock < window.voteEndBlock + minFinalityBlocks) {
    return {
      outcome: 'VOTE_WINDOW_NOT_FINALIZED',
      voteRoundId,
      roundEndBlock: window.voteEndBlock,
      finalizedBlock,
    };
  }

  const topics = voteCast.encodeFilterTopics([walletAddress, BigInt(voteRoundId)]);
  const topic = (value: `0x${string}` | `0x${string}`[] | null | undefined) =>
    typeof value === 'string' ? value : undefined;

  const logs = await thor.logs.filterRawEventLogs({
    range: {
      unit: 'block',
      from: window.voteStartBlock,
      to: window.voteEndBlock,
    },
    options: { offset: 0, limit: 1 },
    criteriaSet: [{
      address: config.xAllocationVotingAddress,
      topic0: topic(topics[0]),
      topic1: topic(topics[1]),
      topic2: topic(topics[2]),
    }],
    order: 'asc',
  });

  // An RPC error is thrown to the caller, never interpreted as no votes.
  return {
    outcome: logs.length > 0 ? 'VOTE_PROOF_PENDING' : 'SAFE_TO_RESET',
    voteRoundId,
    roundEndBlock: window.voteEndBlock,
    finalizedBlock,
  };
}

/** Staged proof for the two-round policy. An isolated raw vote is not a
 * completion; never expire if the full-window chain scan is unavailable.
 * The caller must reconcile a COMPLETE result, and persist a verified
 * incomplete-window checkpoint before requesting an atomic reset. */
export async function verifyPreviousMissionCompletionWindow({
  walletAddress, expectedNetwork, dappRoundId, attemptStartBlock,
  originalActivation = false, minFinalityBlocks = 12,
}: {
  walletAddress: string;
  expectedNetwork: string;
  dappRoundId: number;
  attemptStartBlock: number;
  originalActivation?: boolean;
  minFinalityBlocks?: number;
}): Promise<{
  outcome: 'COMPLETE' | 'SAFE_TO_RESET' | 'VOTE_WINDOW_NOT_FINALIZED';
  proof: MissionAutoResetChainProgress;
}> {
  if (!Number.isSafeInteger(minFinalityBlocks) || minFinalityBlocks < 12 || minFinalityBlocks > 10000) {
    throw new Error('Invalid full mission expiry finality margin.');
  }
  const proof = await readMissionAutoResetChainProgress({
    walletAddress, expectedNetwork, dappRoundId, attemptStartBlock,
    allowDappsThroughVoteRound: true, originalActivation,
  });
  // Positive evidence is protected even if the round is still in progress.
  if (proof.state === 'COMPLETE') return { outcome: 'COMPLETE', proof };
  if (proof.voteRoundEndBlock === null ||
      proof.finalizedThroughBlock < proof.voteRoundEndBlock + minFinalityBlocks) {
    return { outcome: 'VOTE_WINDOW_NOT_FINALIZED', proof };
  }
  return { outcome: 'SAFE_TO_RESET', proof };
}
