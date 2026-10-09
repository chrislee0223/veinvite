export function inspectSecurityClientTiming({
  inviterFirstSeenAt,
  inviterLastSeenAt,
  inviteeFirstSeenAt,
  activatedAt,
  voteCompletedAt,
}: {
  inviterFirstSeenAt: string;
  inviterLastSeenAt: string;
  inviteeFirstSeenAt: string;
  activatedAt: string | null;
  voteCompletedAt: string | null;
}) {
  const inviterFirst = Date.parse(inviterFirstSeenAt);
  const inviterLast = Date.parse(inviterLastSeenAt);
  const inviteeFirst = Date.parse(inviteeFirstSeenAt);
  const activation = activatedAt ? Date.parse(activatedAt) : Number.NaN;
  const vote = voteCompletedAt ? Date.parse(voteCompletedAt) : Number.NaN;
  const switchGapSeconds = Number.isNaN(inviterLast) ||
    Number.isNaN(inviteeFirst) ? null : (inviteeFirst - inviterLast) / 1000;
  const activationGapSeconds = Number.isNaN(activation) ||
    Number.isNaN(inviteeFirst) ? null : Math.abs(activation - inviteeFirst) / 1000;
  const immediateSwitch = switchGapSeconds !== null &&
    activationGapSeconds !== null &&
    switchGapSeconds >= 0 &&
    switchGapSeconds <= 600 &&
    activationGapSeconds <= 600;
  const sharedFirst = Math.max(inviterFirst, inviteeFirst);
  return {
    switchGapSeconds,
    activationGapSeconds,
    immediateSwitch,
    preVoteDetection: Number.isFinite(sharedFirst) && Number.isFinite(vote)
      ? sharedFirst <= vote : null,
    sharedClientFirstSeenAt: Number.isFinite(sharedFirst)
      ? new Date(sharedFirst).toISOString() : null,
  };
}

/**
 * Session first/last timestamps are aggregate observations, not a sequence
 * of login events. Overlapping observation windows cannot establish which
 * wallet was used first: report UNKNOWN, never a zero-second switch.
 *
 * Does not weaken legitimate non-overlapping, <= 10 minute switch evidence.
 */
export function strictSequentialClientSwitchGapSeconds({
  leftFirstSeenAt,
  leftLastSeenAt,
  rightFirstSeenAt,
  rightLastSeenAt,
}: {
  leftFirstSeenAt: string;
  leftLastSeenAt: string;
  rightFirstSeenAt: string;
  rightLastSeenAt: string;
}): number | null {
  const leftFirst = Date.parse(leftFirstSeenAt);
  const leftLast = Date.parse(leftLastSeenAt);
  const rightFirst = Date.parse(rightFirstSeenAt);
  const rightLast = Date.parse(rightLastSeenAt);
  if (
    [leftFirst, leftLast, rightFirst, rightLast]
      .some((value) => !Number.isFinite(value)) ||
    leftFirst > leftLast ||
    rightFirst > rightLast
  ) {
    return null;
  }
  if (rightFirst > leftLast) {
    return (rightFirst - leftLast) / 1000;
  }
  if (leftFirst > rightLast) {
    return (leftFirst - rightLast) / 1000;
  }
  // Overlap, including exactly matching endpoints, is not sequential proof.
  return null;
}

/**
 * Indicates only whether a shared cookie association could be observed
 * before a specific vote. Missing vote time is UNKNOWN, not true.
 */
export function sharedClientPreVoteObservation({
  leftFirstSeenAt,
  rightFirstSeenAt,
  voteCompletedAt,
}: {
  leftFirstSeenAt: string;
  rightFirstSeenAt: string;
  voteCompletedAt: string | null;
}): {
  sharedClientFirstSeenAt: string | null;
  preVoteDetection: boolean | null;
} {
  const left = Date.parse(leftFirstSeenAt);
  const right = Date.parse(rightFirstSeenAt);
  const vote = voteCompletedAt ? Date.parse(voteCompletedAt) : Number.NaN;
  const sharedFirst = Math.max(left, right);
  return {
    sharedClientFirstSeenAt: Number.isFinite(sharedFirst)
      ? new Date(sharedFirst).toISOString() : null,
    preVoteDetection: Number.isFinite(sharedFirst) && Number.isFinite(vote)
      ? sharedFirst <= vote : null,
  };
}
