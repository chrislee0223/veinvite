// Pure, fail-closed policy. Exposes only the owner's read-only mission
// checkpoints, never a permission to participate, invite, claim or get paid.
export type HoldProgressInput = {
  restrictionKind: string | null;
  activeHoldInviteCode: string | null;
  invitationInviteCode: string | null;
  inviteeWallet: string | null;
  verifiedWallet: string;
  networkMatches: boolean;
  assessmentState: string | null;
  appsCompleted: unknown;
  rewardsReceived: unknown;
  vot3Converted: unknown;
  voteCompleted: unknown;
};

export type HoldProgressView = {
  reviewPending: true;
  rewardBlocked: true;
  missionProgress: {
    appsCompleted: number;
    rewardsReceived: number;
    vot3Converted: boolean;
    voteCompleted: boolean;
  };
};

function boundedCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) ||
      value < 0 || value > 3) return null;
  return value;
}

export function readOwnHeldProgress(
  input: HoldProgressInput,
): HoldProgressView | null {
  if (input.restrictionKind !== 'PRE_CLAIM_HOLD' ||
      !input.networkMatches ||
      input.assessmentState !== 'HOLD' ||
      !input.activeHoldInviteCode ||
      input.activeHoldInviteCode !== input.invitationInviteCode ||
      !/^0x[0-9a-f]{40}$/.test(input.verifiedWallet) ||
      input.inviteeWallet?.toLowerCase() !== input.verifiedWallet ||
      typeof input.vot3Converted !== 'boolean' ||
      typeof input.voteCompleted !== 'boolean') {
    return null;
  }

  const appsCompleted = boundedCount(input.appsCompleted);
  const rewardsReceived = boundedCount(input.rewardsReceived);
  if (appsCompleted === null || rewardsReceived === null) return null;

  return {
    reviewPending: true,
    rewardBlocked: true,
    missionProgress: {
      appsCompleted,
      rewardsReceived,
      vot3Converted: input.vot3Converted,
      voteCompleted: input.voteCompleted,
    },
  };
}
