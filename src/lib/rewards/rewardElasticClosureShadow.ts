/**
 * Read-only future-cohort settlement experiment.
 * Never import into live payout, claim, or admission paths.
 * Financial backing/admission must be atomically verified before authorization.
 */
export type ClosureInput = {
  availableWei: string;
  floorWei: string;
  verifiedCount: number;
  terminalRejectedCount: number;
  unfinishedMissionCount: number;
  pendingReviewCount: number;
  futureFundedSeats: number;
  admissionClosed: boolean;
  evidenceVerified: boolean;
  payoutCapWei?: string;
};
const INT = /^(0|[1-9][0-9]*)$/;
const parse = (x: string, name: string) => {
  if (typeof x !== 'string' || !INT.test(x)) throw new Error(`${name}: invalid wei`);
  return BigInt(x);
};
const safeCount = (x: number, name: string) => {
  if (!Number.isSafeInteger(x) || x < 0) throw new Error(`${name}: invalid count`);
  return BigInt(x);
};
export function simulateElasticClosure(x: ClosureInput) {
  const budget = parse(x.availableWei, 'available');
  const floor = parse(x.floorWei, 'floor');
  const cap = x.payoutCapWei === undefined ? null : parse(x.payoutCapWei, 'cap');
  const passed = safeCount(x.verifiedCount, 'verified');
  const rejected = safeCount(x.terminalRejectedCount, 'rejected');
  const unfinished = safeCount(x.unfinishedMissionCount, 'unfinished');
  const underReview = safeCount(x.pendingReviewCount, 'pendingReview');
  const next = safeCount(x.futureFundedSeats, 'futureSeats');
  if (floor === 0n || (cap !== null && cap < floor)) throw new Error('Invalid minimum or cap');
  if (typeof x.admissionClosed !== 'boolean' || typeof x.evidenceVerified !== 'boolean') {
    throw new Error('Missing evidence or admission truth');
  }
  const unsettled = passed + unfinished + underReview + next;
  const reservedFloor = unsettled * floor;
  let status: string = 'OPEN';
  if (!x.evidenceVerified) status = 'UNVERIFIED';
  else if (budget < reservedFloor) status = 'UNDERFUNDED';
  else if (x.admissionClosed && (next !== 0n || unfinished !== 0n || underReview !== 0n)) {
    status = 'WAITING_FOR_TERMINAL_EVIDENCE';
  } else if (x.admissionClosed) status = passed === 0n ? 'CLOSED_NO_WINNERS' : 'SETTLEABLE';
  let award: bigint | null = null;
  let total: bigint | null = null;
  if (status === 'SETTLEABLE') {
    const fair = budget / passed;
    award = cap === null || fair < cap ? fair : cap;
    if (award < floor) { status = 'UNDERFUNDED'; award = null; }
    else total = award * passed;
  }
  return {
    status, writesPerformed: false as const,
    terminalRejectedCount: rejected.toString(),
    unsettledCount: unsettled.toString(),
    reservedFloorWei: reservedFloor.toString(),
    finalAwardWei: award?.toString() ?? null,
    finalTotalWei: total?.toString() ?? null,
    unallocatedWei: total === null ? null : (budget - total).toString(),
    note: 'No financial authorization: source funding and admission must be verified atomically.',
  };
}
