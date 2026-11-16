/**
 * Deterministic preview of the finite, already-enrolled vote-window budget.
 * Read-only; never use this helper instead of an atomic SQL reservation.
 *
 * Participants are established BEFORE the vote window starts and the count
 * is frozen for that window. Historical unfinished participants contribute 0.
 */
export type MissionWindowQuote =
  | { status: 'READY'; rewardWei: string; protectedXWei: string; totalBudgetWei: string }
  | { status: 'INSUFFICIENT_FUNDS'; rewardWei: null };
export function calculateMissionWindowQuote(input: {
  observedPoolWei: string;
  immutableLiabilityWei: string;
  activeWindowParticipants: number;
  xOptionWeiPerParticipant: string;
}): MissionWindowQuote {
  const wei = (raw: string): bigint => {
    if (typeof raw !== 'string' || !/^(0|[1-9][0-9]*)$/.test(raw))
      throw new Error('Invalid nonnegative exact-wei amount');
    return BigInt(raw);
  };
  const n = input.activeWindowParticipants;
  if (!Number.isSafeInteger(n) || n < 1 || n > 5000)
    throw new Error('Invalid bounded vote-window cohort');
  const pool = wei(input.observedPoolWei);
  const fixed = wei(input.immutableLiabilityWei);
  const option = wei(input.xOptionWeiPerParticipant);
  if (pool < fixed) return { status: 'INSUFFICIENT_FUNDS', rewardWei: null };
  const totalX = option * BigInt(n);
  if (pool - fixed <= totalX) return { status: 'INSUFFICIENT_FUNDS', rewardWei: null };
  const perPerson = (pool - fixed - totalX) / BigInt(n);
  if (perPerson < 1n) return { status: 'INSUFFICIENT_FUNDS', rewardWei: null };
  return {
    status: 'READY', rewardWei: perPerson.toString(),
    protectedXWei: totalX.toString(),
    totalBudgetWei: (perPerson * BigInt(n) + totalX).toString(),
  };
}
