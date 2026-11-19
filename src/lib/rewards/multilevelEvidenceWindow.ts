/**
 * Pure, fail-closed STRUCTURAL validation of the two different mission flows.
 *
 * No DB access, no VeChain calls, no reward writing. This module cannot attest
 * that a transaction is real: a trusted indexer MUST independently validate
 * all log receipts, app ownership, chain finality, wallet identity and Sybil.
 *
 * NEW onboarding: 3 distinct rewarded dApps in round N, vote in N+1;
 * entitlement is recognized only in the vote/completion round N+1.
 *
 * EXISTING active member: one positively rewarded dApp + any dApp vote
 * in the SAME round, only AFTER first onboarding was completed.
 */
export type EvidenceRoundWindow = {
  roundId: number;
  startBlock: number;
  endBlock: number;
};

export type RewardedDappProof = {
  appId: string;
  txId: string;
  blockNumber: number;
  roundId: number;
  rewardWei: string;
};

export type VoteProof = {
  votedAppId: string;
  txId: string;
  blockNumber: number;
  roundId: number;
};

export type MemberEvidence = {
  wallet: string;
  /** Trusted first-ever valid onboarding completion round, not self-attested. */
  firstOnboardedRoundId: number;
  rewardedDapps: readonly RewardedDappProof[];
  votes: readonly VoteProof[];
};

export type MissionEvidenceInput = {
  kind: 'ONBOARDING' | 'ACTIVE';
  /** The round that would CREATE the resulting referral/network entitlement. */
  earningRoundId: number;
  /** For onboarding R+1, dappWindow is R; for active, both windows are R. */
  dappWindow: EvidenceRoundWindow;
  voteWindow: EvidenceRoundWindow;
  member: MemberEvidence;
};

/** Invalid/unconfirmed evidence must NEVER be considered reward eligible. */
export type MissionEvidenceVerdict =
  | { eligible: true; countedAppIds: string[]; eligibleVoteTxId: string }
  | { eligible: false; reason:
      'INVALID_INPUT' | 'INVALID_ROUND_WINDOW' | 'FIRST_ONBOARDING_ROUND_MISMATCH' |
      'ALREADY_ONBOARDED_OR_TOO_EARLY' | 'INSUFFICIENT_REWARDED_DAPPS' |
      'MISSING_VALID_VOTE' };

const ADDRESS = /^0x[0-9a-f]{40}$/;
const APP_ID = /^0x[0-9a-f]{64}$/;
const TX_ID = /^0x[0-9a-f]{64}$/;
const WEI = /^(0|[1-9][0-9]*)$/;
const safeRound = (x: number): boolean => Number.isSafeInteger(x) && x > 0;
const safeBlock = (x: number): boolean => Number.isSafeInteger(x) && x > 0;

function validWindow(win: EvidenceRoundWindow, expected: number): boolean {
  return !!win && win.roundId === expected &&
    safeBlock(win.startBlock) && safeBlock(win.endBlock) &&
    win.startBlock <= win.endBlock;
}

function inWindow(block: number, window: EvidenceRoundWindow): boolean {
  return safeBlock(block) && block >= window.startBlock &&
    block <= window.endBlock;
}

export function checkMissionEvidence(input: MissionEvidenceInput): MissionEvidenceVerdict {
  if (!input || (input.kind !== 'ACTIVE' && input.kind !== 'ONBOARDING') ||
    !safeRound(input.earningRoundId) ||
    !input.member || typeof input.member.wallet !== 'string' ||
    !ADDRESS.test(input.member.wallet.toLowerCase()) ||
    !safeRound(input.member.firstOnboardedRoundId) ||
    !Array.isArray(input.member.rewardedDapps) ||
    !Array.isArray(input.member.votes) ||
    input.member.rewardedDapps.length > 10000 || input.member.votes.length > 10000) {
    return { eligible:false, reason:'INVALID_INPUT' };
  }
  const round = input.earningRoundId;
  const dappRound = input.kind === 'ONBOARDING' ? round - 1 : round;
  if (!safeRound(dappRound) ||
    !validWindow(input.dappWindow, dappRound) ||
    !validWindow(input.voteWindow, round)) {
    return { eligible:false, reason:'INVALID_ROUND_WINDOW' };
  }
  if (input.kind === 'ONBOARDING') {
    if (input.member.firstOnboardedRoundId !== round) {
      return { eligible:false, reason:'FIRST_ONBOARDING_ROUND_MISMATCH' };
    }
  } else if (input.member.firstOnboardedRoundId >= round) {
    return { eligible:false, reason:'ALREADY_ONBOARDED_OR_TOO_EARLY' };
  }
  const appIds = new Set<string>();
  for (const proof of input.member.rewardedDapps) {
    if (!proof || typeof proof.appId !== 'string' ||
      typeof proof.txId !== 'string' || typeof proof.rewardWei !== 'string' ||
      !APP_ID.test(proof.appId.toLowerCase()) ||
      !TX_ID.test(proof.txId.toLowerCase()) ||
      !WEI.test(proof.rewardWei) || BigInt(proof.rewardWei) <= 0n ||
      proof.roundId !== dappRound ||
      !inWindow(proof.blockNumber,input.dappWindow)) continue;
    appIds.add(proof.appId.toLowerCase());
  }
  const required = input.kind === 'ONBOARDING' ? 3 : 1;
  if (appIds.size < required) {
    return { eligible:false, reason:'INSUFFICIENT_REWARDED_DAPPS' };
  }
  // The voted dApp may differ from all rewarded dApps. Only a valid vote
  // anchored in the required round is necessary.
  for (const vote of input.member.votes) {
    if (!vote || typeof vote.votedAppId !== 'string' ||
      typeof vote.txId !== 'string' ||
      !APP_ID.test(vote.votedAppId.toLowerCase()) ||
      !TX_ID.test(vote.txId.toLowerCase()) ||
      vote.roundId !== round ||
      !inWindow(vote.blockNumber,input.voteWindow)) continue;
    return {
      eligible:true,
      countedAppIds:[...appIds].sort(),
      eligibleVoteTxId:vote.txId.toLowerCase(),
    };
  }
  return { eligible:false, reason:'MISSING_VALID_VOTE' };
}
