/**
 * Future-only VeInvite mission window proof verifier.
 *
 * Stateless, read-only, and NOT authoritative until wired to the canonical
 * attempt ledger and the actual on-chain finality checkpoint. All proof
 * positions must come from verified VeChain events.
 */
export type MissionChainPosition = {
  blockNumber: number;
  txIndex: number;
  clauseIndex: number;
};
export type MissionDappEvent = MissionChainPosition & {
  appId: string;
};
export type MissionVoteEvent = MissionChainPosition & {
  roundId: number;
};
export type MissionAttemptProof = {
  attemptStartBlock: number;
  dappRoundId: number;
  dappRoundStartBlock: number;
  dappRoundEndBlock: number;
  voteRoundId: number;
  voteRoundStartBlock: number;
  voteRoundEndBlock: number;
  dappRewards: readonly MissionDappEvent[];
  conversion: MissionChainPosition | null;
  vote: MissionVoteEvent | null;
};
export type MissionAttemptProofResult = {
  state: 'INVALID' | 'NEED_DAPPS' | 'NEED_CONVERSION' | 'NEED_NEXT_ROUND_VOTE' | 'COMPLETE';
  countedAppIds: string[];
};
const positiveSafe = (value: number) => Number.isSafeInteger(value) && value >= 1;
function isPosition(value: MissionChainPosition | null): value is MissionChainPosition {
  return !!value && positiveSafe(value.blockNumber) &&
    Number.isSafeInteger(value.txIndex) && value.txIndex >= 0 &&
    Number.isSafeInteger(value.clauseIndex) && value.clauseIndex >= 0;
}
function positionCompare(left: MissionChainPosition, right: MissionChainPosition): number {
  return left.blockNumber - right.blockNumber ||
    left.txIndex - right.txIndex || left.clauseIndex - right.clauseIndex;
}
const invalid = (): MissionAttemptProofResult => ({ state: 'INVALID', countedAppIds: [] });
/**
 * This verifies sequencing, not Sybil, snapshot finality, funding or uniqueness
 * across historical paid referrals. Those remain separate canonical gates.
 */
export function verifyMissionAttemptProof(proof: MissionAttemptProof): MissionAttemptProofResult {
  const { attemptStartBlock: joined, dappRoundId: round,
    dappRoundStartBlock: dappStart, dappRoundEndBlock: dappEnd,
    voteRoundId: voteRound, voteRoundStartBlock: voteStart,
    voteRoundEndBlock: voteEnd, dappRewards: rewards,
    conversion, vote } = proof;
  if (![joined, round, dappStart, dappEnd, voteRound, voteStart, voteEnd]
      .every(positiveSafe) || voteRound !== round + 1 ||
      dappStart > dappEnd || dappEnd >= voteStart ||
      voteStart > voteEnd || joined < dappStart || joined > dappEnd ||
      !Array.isArray(rewards) || rewards.length > 5000) return invalid();
  const valid = new Map<string, MissionDappEvent>();
  for (const e of rewards) {
    const appId = typeof e.appId === 'string' ? e.appId.toLowerCase() : '';
    if (!/^0x[0-9a-f]{64}$/.test(appId) || !isPosition(e)) return invalid();
    if (e.blockNumber < joined || e.blockNumber > dappEnd) continue;
    const earliest = valid.get(appId);
    if (!earliest || positionCompare(e, earliest) < 0) valid.set(appId, e);
  }
  const eligible = [...valid.entries()].sort((a,b) =>
    positionCompare(a[1], b[1])).slice(0,3);
  const countedAppIds = eligible.map(([app])=>app);
  if (countedAppIds.length < 3)
    return { state: 'NEED_DAPPS', countedAppIds };
  if (!conversion) return { state: 'NEED_CONVERSION', countedAppIds };
  if (!isPosition(conversion) ||
      positionCompare(conversion, eligible[0][1]) <= 0 ||
      conversion.blockNumber > voteEnd) return invalid();
  if (!vote) return { state: 'NEED_NEXT_ROUND_VOTE', countedAppIds };
  if (!isPosition(vote) || !positiveSafe(vote.roundId)) return invalid();
  if (vote.roundId !== voteRound || vote.blockNumber < voteStart ||
      vote.blockNumber > voteEnd || positionCompare(vote, conversion) <= 0) return invalid();
  return { state: 'COMPLETE', countedAppIds };
}
