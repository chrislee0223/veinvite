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
