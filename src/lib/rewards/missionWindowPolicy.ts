/**
 * Read-only classifier for the proposed ONE-attempt/two-round VeInvite mission.
 *
 * This has deliberately NO database writes and is NOT the payout authority.
 * Only a persisted attempt with chain-indexed starting/ending block boundaries
 * may eventually supply missionStartRoundId to this helper.
 */
export type MissionWindowState =
  | 'LEGACY'
  | 'WAITING_FOR_ACCEPTANCE'
  | 'COLLECT_DAPPS'
  | 'VOTE_WINDOW'
  | 'MISSED_VOTE_RESTART_REQUIRED'
  | 'VOTE_PROOF_PENDING'
  | 'SECURITY_REVIEW'
  | 'COMPLETION_PROTECTED'
  | 'REWARD_PROTECTED'
  | 'TERMINAL'
  | 'INVALID';

export type MissionWindowInput = {
  rolloutStartRoundId: number;
  missionStartRoundId: number | null;
  currentRoundId: number;
  invitationStatus: string;
  rewardStatus: string | null;
  sybilStatus: string | null;
  voteCompleted: boolean;
  hasDurableReservation: boolean;
};

export type MissionWindowDecision = {
  state: MissionWindowState;
  targetVoteRoundId: number | null;
  /** A user-facing state only, never permission to mutate invitation history. */
  restartRequired: boolean;
};

export function classifyMissionWindow(input: MissionWindowInput): MissionWindowDecision {
  const { rolloutStartRoundId: startPolicy, missionStartRoundId: start,
    currentRoundId: current, invitationStatus: status, rewardStatus: reward,
    sybilStatus: sybil, voteCompleted, hasDurableReservation } = input;
  const integer = (n: number) => Number.isSafeInteger(n) && n >= 1;
  if (!integer(startPolicy) || !integer(current) ||
      (start !== null && !integer(start)) ||
      current < startPolicy - 1) {
    return { state: 'INVALID', targetVoteRoundId: null, restartRequired: false };
  }
  const target = start !== null && Number.isSafeInteger(start + 1)
    ? start + 1 : null;
  const result = (state: MissionWindowState, restartRequired = false): MissionWindowDecision =>
    ({ state, targetVoteRoundId: target, restartRequired });

  // Financial and verified evidence is immutable across later rounds.
  if (reward === 'PAID' || hasDurableReservation) return result('REWARD_PROTECTED');
  if (reward === 'ELIGIBLE' || status === 'COMPLETED') return result('COMPLETION_PROTECTED');
  if (voteCompleted) return result('VOTE_PROOF_PENDING');
  if (sybil === 'REVIEW') return result('SECURITY_REVIEW');
  if (status === 'CANCELLED' || sybil === 'BLOCKED' || reward === 'FORFEITED')
    return result('TERMINAL');
  if (status === 'PENDING_ACCEPTANCE') return result('WAITING_FOR_ACCEPTANCE');
  if (status !== 'ACTIVATING' || start === null || start < startPolicy)
    return result('LEGACY');
  if (target === null || current < start) return result('INVALID');
  if (current === start) return result('COLLECT_DAPPS');
  if (current === target) return result('VOTE_WINDOW');
  return result('MISSED_VOTE_RESTART_REQUIRED', true);
}
