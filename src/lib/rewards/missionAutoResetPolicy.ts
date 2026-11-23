/**
 * Pure, read-only policy for future automatic mission attempts.
 *
 * N: collect 3 distinct external dApps; N+1: allocation vote;
 * N+2: the next attempt starts from the CHAIN-VERIFIED N+2 start block.
 *
 * Never use this projection as a payment, eligibility, security or DB write
 * authority. A transaction must independently validate and persist an attempt
 * before the app can show 0/3 or emit a single reset notification.
 */
export type MissionAutoResetInput = {
  originalDappRoundId: number | null;
  latestAttemptDappRoundId: number | null;
  currentRoundId: number;
  invitationStatus: string;
  rewardStatus: string;
  sybilStatus: string | null;
  ineligibleAt: string | null;
  voteCompleted: boolean;
  voteProofPending: boolean;
  hasDurableReservation: boolean;
  hasOutstandingHeldFunds: boolean;
  hasVerifiedEntryProof: boolean;
  /** Verified from VeBetterDAO getRound(targetDappRoundId), never browser input. */
  targetRoundStartBlock: number | null;
  targetRoundEndBlock: number | null;
  finalizedBestBlock: number | null;
};

export type MissionAutoResetState =
  | 'INVALID'
  | 'PROTECTED'
  | 'SECURITY_REVIEW'
  | 'TERMINAL'
  | 'LEGACY_REVIEW'
  | 'VOTE_PROOF_PENDING'
  | 'FUNDS_HELD'
  | 'ORIGINAL_WINDOW'
  | 'ACTIVE_ATTEMPT'
  | 'ROUND_PROOF_UNAVAILABLE'
  | 'START_NEW_ATTEMPT';

export type MissionAutoResetDecision = {
  state: MissionAutoResetState;
  targetDappRoundId: number | null;
  targetVoteRoundId: number | null;
  /** Only valid for START_NEW_ATTEMPT/ACTIVE_ATTEMPT; inclusive. */
  eligibleDappStartBlock: number | null;
  eligibleDappEndBlock: number | null;
  /** Never send until exactly one durable attempt is committed. */
  notifyOnlyAfterCommit: boolean;
};

const validRound = (round: number | null): round is number =>
  Number.isSafeInteger(round) && round !== null && round > 0;
const validBlock = (block: number | null): block is number =>
  Number.isSafeInteger(block) && block !== null && block > 0;

function result(
  state: MissionAutoResetState,
  targetDappRoundId: number | null = null,
  startBlock: number | null = null,
  endBlock: number | null = null,
): MissionAutoResetDecision {
  return {
    state,
    targetDappRoundId,
    targetVoteRoundId: targetDappRoundId === null ? null : targetDappRoundId + 1,
    eligibleDappStartBlock: startBlock,
    eligibleDappEndBlock: endBlock,
    notifyOnlyAfterCommit: state === 'START_NEW_ATTEMPT',
  };
}

export function deriveMissionAutoReset(
  input: MissionAutoResetInput,
): MissionAutoResetDecision {
  const {
    originalDappRoundId: original,
    latestAttemptDappRoundId: latest,
    currentRoundId: current,
  } = input;

  if (!validRound(current) || (original !== null && !validRound(original)) ||
      (latest !== null && !validRound(latest)) ||
      (original !== null && (!validRound(original + 1) || current < original))) {
    return result('INVALID');
  }

  // Financial and final completion evidence outrank any apparent expiry.
  if (input.invitationStatus === 'COMPLETED' ||
      input.rewardStatus === 'ELIGIBLE' ||
      input.rewardStatus === 'PAID' ||
      input.hasDurableReservation) {
    return result('PROTECTED');
  }
  if (input.invitationStatus === 'CANCELLED' ||
      input.rewardStatus === 'FORFEITED' ||
      input.sybilStatus === 'BLOCKED' ||
      input.ineligibleAt !== null) {
    return result('TERMINAL');
  }
  if (input.sybilStatus === 'REVIEW' || input.invitationStatus === 'UNDER_REVIEW') {
    return result('SECURITY_REVIEW');
  }
  if (input.invitationStatus !== 'ACTIVATING' ||
      input.rewardStatus !== 'PENDING') {
    return result('INVALID');
  }

  // Never clear a vote that may already exist on-chain but is not indexed yet.
  if (input.voteCompleted || input.voteProofPending) {
    return result('VOTE_PROOF_PENDING');
  }
  if (input.hasOutstandingHeldFunds) return result('FUNDS_HELD');
  if (!input.hasVerifiedEntryProof || original === null) {
    return result('LEGACY_REVIEW');
  }

  // One attempt spans exactly two consecutive rounds. Deriving from ORIGINAL
  // round, not "last time user opened the app", handles delayed cron execution
  // without moving the qualifying chain boundary.
  if (current <= original + 1) {
    return result('ORIGINAL_WINDOW', original);
  }

  const delta = current - original;
  const target = original + 2 * Math.floor(delta / 2);
  if (!validRound(target) || !validRound(target + 1)) return result('INVALID');

  if (latest !== null && (latest > target || latest < original ||
      (latest - original) % 2 !== 0)) {
    return result('INVALID');
  }

  const start = input.targetRoundStartBlock;
  const end = input.targetRoundEndBlock;
  const best = input.finalizedBestBlock;

  if (!validBlock(start) || !validBlock(end) || !validBlock(best) ||
      end <= start || start > best) {
    return result('ROUND_PROOF_UNAVAILABLE', target);
  }

  if (latest === target) return result('ACTIVE_ATTEMPT', target, start, end);
  return result('START_NEW_ATTEMPT', target, start, end);
}

/** Reject any old or cross-round dApp event; never trust a cached 3/3. */
export function qualifiesForAttemptDapp(
  eventBlock: number,
  decision: MissionAutoResetDecision,
): boolean {
  return (decision.state === 'ACTIVE_ATTEMPT' ||
          decision.state === 'START_NEW_ATTEMPT') &&
    Number.isSafeInteger(eventBlock) &&
    decision.eligibleDappStartBlock !== null &&
    decision.eligibleDappEndBlock !== null &&
    eventBlock >= decision.eligibleDappStartBlock &&
    eventBlock <= decision.eligibleDappEndBlock;
}
