import {
  getVeBetterActivityProgress,
} from '@/lib/vebetter/activity';
import {
  readVeBetterRoundWindow,
} from '@/lib/vebetter/entryEligibility';
import {
  getVeBetterVot3ConversionProgress,
} from '@/lib/vebetter/vot3Conversion';
import {
  getVeBetterVoteProgress,
} from '@/lib/vebetter/vote';
import {
  verifyMissionAttemptProof,
  type MissionAttemptProofResult,
} from '@/lib/rewards/missionWindowEvidence';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

/**
 * Read-only, attempt-scoped VeChain proof scanner.
 *
 * This explicitly DOES NOT write into the monotonic legacy invitation fields,
 * trigger Sybil clearance, reserve money or issue a Claim. Enabling it as a
 * payout authority requires independent canonical funding/identity gates.
 */
export type MissionAutoResetChainProgress = {
  state: MissionAttemptProofResult['state'] | 'VOTE_ROUND_NOT_STARTED';
  dappRoundId: number;
  voteRoundId: number;
  appsCompleted: number;
  countedAppIds: string[];
  vot3Converted: boolean;
  voteCompleted: boolean;
  attemptStartBlock: number;
  dappRoundEndBlock: number;
  voteRoundStartBlock: number | null;
  voteRoundEndBlock: number | null;
  latestObservedBlock: number;
};

const positiveSafe = (value: number) =>
  Number.isSafeInteger(value) && value > 0;

export async function readMissionAutoResetChainProgress({
  walletAddress,
  expectedNetwork,
  dappRoundId,
  attemptStartBlock,
}: {
  walletAddress: string;
  expectedNetwork: string;
  dappRoundId: number;
  attemptStartBlock: number;
}): Promise<MissionAutoResetChainProgress> {
  if (!/^0x[0-9a-f]{40}$/i.test(walletAddress) ||
      !positiveSafe(dappRoundId) ||
      !positiveSafe(dappRoundId + 1) ||
      !positiveSafe(attemptStartBlock)) {
    throw new Error('Invalid mission attempt proof input.');
  }

  const configuredNetwork = getVeBetterNetworkConfig().network;
  if (expectedNetwork !== configuredNetwork) {
    throw new Error('Mission proof network does not match the chain.');
  }

  const dappRound = await readVeBetterRoundWindow({ roundId: dappRoundId });
  if (dappRound.network !== expectedNetwork ||
      dappRound.voteStartBlock !== attemptStartBlock ||
      dappRound.voteEndBlock <= attemptStartBlock) {
    throw new Error('Mission start block is not the verified round boundary.');
  }

  const activity = await getVeBetterActivityProgress({
    receiverAddress: walletAddress,
    activationBlock: attemptStartBlock,
    checkedBlock: dappRound.voteEndBlock,
  });
  const appsCompleted = activity.appsCompleted;
  const firstDapp = activity.qualifyingRewardEvents[0] ?? null;
  const countedAppIds = activity.qualifyingRewardEvents.map((event) => event.appId);

  const voteRoundId = dappRoundId + 1;
  const voteRound = dappRound.currentRoundId >= voteRoundId
    ? await readVeBetterRoundWindow({ roundId: voteRoundId })
    : null;

  if (voteRound && (voteRound.network !== expectedNetwork ||
      voteRound.voteStartBlock <= dappRound.voteEndBlock)) {
    throw new Error('Vote window is not the round after the dApp window.');
  }

  let conversion = null;
  if (firstDapp) {
    const progress = await getVeBetterVot3ConversionProgress({
      walletAddress,
      activationBlock: attemptStartBlock,
      firstQualifyingReward: firstDapp,
      // Conversions cannot qualify after the last vote block.
      checkedBlock: voteRound?.voteEndBlock ?? dappRound.voteEndBlock,
    });
    conversion = progress.qualifyingConversion;
  }

  let vote = null;
  if (conversion && voteRound) {
    const verifiedVote = await getVeBetterVoteProgress({
      voterAddress: walletAddress,
      conversionPosition: conversion,
      expectedRoundId: voteRoundId,
      checkedFromBlock: voteRound.voteStartBlock,
      checkedThroughBlock: voteRound.voteEndBlock,
    });
    if (verifiedVote.voteCompleted &&
        verifiedVote.voteRoundId === voteRoundId &&
        verifiedVote.voteCompletedBlock !== null &&
        verifiedVote.voteTxIndex !== null &&
        verifiedVote.voteClauseIndex !== null) {
      vote = {
        blockNumber: verifiedVote.voteCompletedBlock,
        txIndex: verifiedVote.voteTxIndex,
        clauseIndex: verifiedVote.voteClauseIndex,
        roundId: voteRoundId,
      };
    }
  }

  const state = voteRound
    ? verifyMissionAttemptProof({
        attemptStartBlock,
        dappRoundId,
        dappRoundStartBlock: dappRound.voteStartBlock,
        dappRoundEndBlock: dappRound.voteEndBlock,
        voteRoundId,
        voteRoundStartBlock: voteRound.voteStartBlock,
        voteRoundEndBlock: voteRound.voteEndBlock,
        dappRewards: activity.qualifyingRewardEvents,
        conversion,
        vote,
      }).state
    : appsCompleted < 3
      ? 'NEED_DAPPS'
      : !conversion
        ? 'NEED_CONVERSION'
        : 'VOTE_ROUND_NOT_STARTED';

  return {
    state,
    dappRoundId,
    voteRoundId,
    appsCompleted,
    countedAppIds,
    vot3Converted: conversion !== null,
    voteCompleted: state === 'COMPLETE',
    attemptStartBlock,
    dappRoundEndBlock: dappRound.voteEndBlock,
    voteRoundStartBlock: voteRound?.voteStartBlock ?? null,
    voteRoundEndBlock: voteRound?.voteEndBlock ?? null,
    latestObservedBlock: activity.latestBlock,
  };
}
