import { ThorClient } from '@vechain/sdk-network';
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
export type AttemptProofEvent = {
  event_type: 'DAPP_REWARD' | 'VOT3_CONVERSION' | 'ALLOCATION_VOTE';
  app_id: string | null;
  amount_wei: string | null;
  vote_round_id: number | null;
  tx_id: string;
  block_number: number;
  tx_index: number;
  clause_index: number;
  block_timestamp: string;
};
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
  finalizedThroughBlock: number;
  events: AttemptProofEvent[];
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

  const thor = ThorClient.at(getVeBetterNetworkConfig().nodeUrl);
  const finalized = await thor.blocks.getBlockCompressed('finalized');
  const finalizedBlock = finalized?.number;
  if (typeof finalizedBlock !== 'number' || !positiveSafe(finalizedBlock) ||
      finalizedBlock < attemptStartBlock) {
    throw new Error('Attempt chain finality not available.');
  }

  const activity = await getVeBetterActivityProgress({
    receiverAddress: walletAddress,
    activationBlock: attemptStartBlock,
    checkedBlock: Math.min(dappRound.voteEndBlock, finalizedBlock),
  });
  if (activity.latestBlock < Math.min(dappRound.voteEndBlock, finalizedBlock)) {
    throw new Error('dApp proof node has not reached the finalized scan boundary');
  }
  const appsCompleted = Math.min(3, activity.qualifyingRewardEvents.length);
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
      checkedBlock: Math.min(voteRound?.voteEndBlock ?? dappRound.voteEndBlock, finalizedBlock),
    });
    if (progress.checkedBlock < Math.min(voteRound?.voteEndBlock ?? dappRound.voteEndBlock, finalizedBlock)) {
      throw new Error('Conversion proof node has not reached the finalized scan boundary');
    }
    conversion = progress.qualifyingConversion;
  }

  let vote: {blockNumber:number; txIndex:number; clauseIndex:number; roundId:number; txId:string; blockTimestamp:number} | null = null;
  if (conversion && voteRound && finalizedBlock >= voteRound.voteStartBlock && appsCompleted === 3) {
    const verifiedVote = await getVeBetterVoteProgress({
      voterAddress: walletAddress,
      conversionPosition: conversion,
      expectedRoundId: voteRoundId,
      checkedFromBlock: voteRound.voteStartBlock,
      checkedThroughBlock: Math.min(voteRound.voteEndBlock, finalizedBlock),
    });
    if (verifiedVote.latestBlock < Math.min(voteRound.voteEndBlock, finalizedBlock)) {
      throw new Error('Vote proof node has not reached the finalized scan boundary');
    }
    if (verifiedVote.voteCompleted &&
        verifiedVote.voteRoundId === voteRoundId &&
        verifiedVote.voteCompletedBlock !== null &&
        verifiedVote.voteTxIndex !== null &&
        verifiedVote.voteClauseIndex !== null && verifiedVote.voteTxId !== null &&
        verifiedVote.voteBlockTimestamp !== null) {
      vote = {
        blockNumber: verifiedVote.voteCompletedBlock,
        txIndex: verifiedVote.voteTxIndex,
        clauseIndex: verifiedVote.voteClauseIndex,
        roundId: voteRoundId,
        txId: verifiedVote.voteTxId,
        blockTimestamp: verifiedVote.voteBlockTimestamp,
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

  if (state === 'INVALID') throw new Error('Invalid attempt chain proof');
  const proofEvent = (event: {txId:string; blockNumber:number; txIndex:number; clauseIndex:number; blockTimestamp:number},
      kind: AttemptProofEvent['event_type'], appId: string | null, amount: string | null,
      round: number | null): AttemptProofEvent => ({
    event_type: kind, app_id: appId, amount_wei: amount, vote_round_id: round,
    tx_id: event.txId.toLowerCase(), block_number: event.blockNumber,
    tx_index: event.txIndex, clause_index: event.clauseIndex,
    block_timestamp: new Date(event.blockTimestamp * 1000).toISOString(),
  });
  const events = activity.qualifyingRewardEvents.slice(0,3).map(event =>
    proofEvent(event,'DAPP_REWARD',event.appId.toLowerCase(),event.amountWei,null));
  if (conversion) events.push(proofEvent(conversion,'VOT3_CONVERSION',null,conversion.amountWei,null));
  if (vote && state === 'COMPLETE') events.push(proofEvent(vote,'ALLOCATION_VOTE',null,null,voteRoundId));
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
    finalizedThroughBlock: finalizedBlock,
    events,
  };
}
