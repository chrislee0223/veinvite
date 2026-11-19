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

export type ChainExecutionPosition = {
  txIndex: number;
  clauseIndex: number;
};

export type RewardedDappProof = {
  /** Required for onboarding VOT3 execution-order verification. */
  txIndex?: number;
  clauseIndex?: number;
  appId: string;
  txId: string;
  blockNumber: number;
  roundId: number;
  rewardWei: string;
};

export type VoteProof = {
  txIndex?: number;
  clauseIndex?: number;
  votedAppId: string;
  txId: string;
  blockNumber: number;
  roundId: number;
};

export type Vot3ConversionEvidence = {
  /** Only trusted matching B3TR debit + VOT3 mint transaction qualifies. */
  txId: string;
  blockNumber: number;
  txIndex: number;
  clauseIndex: number;
  amountWei: string;
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
  /** Immutable, trusted invitation activation position for fresh onboarding. */
  activationBlock?: number;
  /** Strictly chain-verified paired B3TR->VOT3 conversion after the first reward. */
  conversion?: Vot3ConversionEvidence | null;
};

/** Invalid/unconfirmed evidence must NEVER be considered reward eligible. */
export type MissionEvidenceVerdict =
  | { eligible: true; countedAppIds: string[]; eligibleVoteTxId: string }
  | { eligible: false; reason:
      'INVALID_INPUT' | 'INVALID_ROUND_WINDOW' | 'FIRST_ONBOARDING_ROUND_MISMATCH' |
      'ALREADY_ONBOARDED_OR_TOO_EARLY' | 'INSUFFICIENT_REWARDED_DAPPS' |
      'MISSING_VALID_VOTE' | 'MISSING_VERIFIED_VOT3_CONVERSION' |
      'INVALID_ONBOARDING_ACTIVATION' };

const ADDRESS = /^0x[0-9a-f]{40}$/;
const APP_ID = /^0x[0-9a-f]{64}$/;
const TX_ID = /^0x[0-9a-f]{64}$/;
const WEI = /^(0|[1-9][0-9]*)$/;
const safeRound = (x: number): boolean => Number.isSafeInteger(x) && x > 0;
const safeBlock = (x: number): boolean => Number.isSafeInteger(x) && x > 0;
const safeIndex = (x: number | undefined): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;

type Position = {blockNumber:number;txIndex:number;clauseIndex:number};
function after(a:Position,b:Position):boolean {
  return a.blockNumber>b.blockNumber ||
    (a.blockNumber===b.blockNumber && (
      a.txIndex>b.txIndex ||
      (a.txIndex===b.txIndex && a.clauseIndex>b.clauseIndex)
    ));
}

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
  if (input.kind==='ONBOARDING' && (
    !safeBlock(input.activationBlock ?? NaN) ||
    (input.activationBlock ?? 0)<input.dappWindow.startBlock ||
    (input.activationBlock ?? 0)>input.dappWindow.endBlock)) {
    return {eligible:false,reason:'INVALID_ONBOARDING_ACTIVATION'};
  }
  const appIds = new Set<string>();
  let earliestReward: (RewardedDappProof & Position) | null = null;
  for (const proof of input.member.rewardedDapps) {
    if (!proof || typeof proof.appId !== 'string' ||
      typeof proof.txId !== 'string' || typeof proof.rewardWei !== 'string' ||
      !APP_ID.test(proof.appId.toLowerCase()) ||
      !TX_ID.test(proof.txId.toLowerCase()) ||
      !WEI.test(proof.rewardWei) || BigInt(proof.rewardWei) <= 0n ||
      proof.roundId !== dappRound ||
      !inWindow(proof.blockNumber,input.dappWindow) ||
      (input.kind==='ONBOARDING' && proof.blockNumber<(input.activationBlock ?? 0))) continue;
    if(input.kind==='ONBOARDING') {
      if(!safeIndex(proof.txIndex)||!safeIndex(proof.clauseIndex))continue;
      if(!earliestReward || after(earliestReward,proof as RewardedDappProof & Position)) {
        earliestReward=proof as RewardedDappProof & Position;
      }
    }
    appIds.add(proof.appId.toLowerCase());
  }
  const required = input.kind === 'ONBOARDING' ? 3 : 1;
  if (appIds.size < required) {
    return { eligible:false, reason:'INSUFFICIENT_REWARDED_DAPPS' };
  }
  // Conversion must be a two-sided B3TR->VOT3 transfer attested by the
  // trusted existing verifier; it cannot be inferred from the vote alone.
  const conversion=input.conversion;
  if(input.kind==='ONBOARDING') {
    if(!conversion || !earliestReward || !TX_ID.test(conversion.txId?.toLowerCase()??'') ||
       !WEI.test(conversion.amountWei??'') || BigInt(conversion.amountWei)<=0n ||
       !safeIndex(conversion.txIndex) || !safeIndex(conversion.clauseIndex) ||
       !safeBlock(conversion.blockNumber) ||
       conversion.blockNumber>input.voteWindow.endBlock ||
       !after(conversion,earliestReward)) {
      return {eligible:false,reason:'MISSING_VERIFIED_VOT3_CONVERSION'};
    }
  }
  // The voted dApp may differ from all rewarded dApps. A new onboarding vote
  // must also occur strictly AFTER the verified B3TR->VOT3 conversion.
  for (const vote of input.member.votes) {
    if (!vote || typeof vote.votedAppId !== 'string' ||
      typeof vote.txId !== 'string' ||
      !APP_ID.test(vote.votedAppId.toLowerCase()) ||
      !TX_ID.test(vote.txId.toLowerCase()) ||
      vote.roundId !== round ||
      !inWindow(vote.blockNumber,input.voteWindow)) continue;
    if(input.kind==='ONBOARDING' && (
      !safeIndex(vote.txIndex) || !safeIndex(vote.clauseIndex) ||
      !after(vote as VoteProof & Position,conversion!)
    ))continue;
    return {
      eligible:true,
      countedAppIds:[...appIds].sort(),
      eligibleVoteTxId:vote.txId.toLowerCase(),
    };
  }
  return { eligible:false, reason:'MISSING_VALID_VOTE' };
}
