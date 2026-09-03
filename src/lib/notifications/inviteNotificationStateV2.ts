import {
  INVITE_NOTIFICATION_STAGE,
  type InviteNotificationSource,
  type PaidRewardEvidence,
} from './inviteNotificationState';

export type InviteNotificationKindV2 =
  | 'INVITE_ACCEPTED'
  | 'DAPP_PROGRESS'
  | 'VOT3_CONVERTED'
  | 'REWARD_READY'
  | 'REWARD_PAID'
  | 'INVITE_INELIGIBLE';

export type RewardReadyEvidence = {
  invite_code: string;
  status: string;
  reserved_amount_wei: string | null;
  reserved_at: string | null;
};

export type InviteNotificationReadStateV2 = {
  highestStage: number;
  dappProgressAcknowledged: number;
  rewardReadyAcknowledgedAt: string | null;
};

export type InviteNotificationPayloadV2 = {
  inviteCode: string;
  kind: InviteNotificationKindV2;
  stage: number;
  eventAt: string;
  rewardAmountWei: string | null;
  dappProgress: number | null;
  collapsedProgress: boolean;
};

function validTimestamp(value: string | null): value is string {
  return Boolean(value) && !Number.isNaN(Date.parse(value as string));
}

function positiveIntegerString(value: string | null): value is string {
  return Boolean(value) && /^\d+$/u.test(value as string) && BigInt(value as string) > 0n;
}

function validTransactionId(value: string | null): value is string {
  return /^0x[0-9a-f]{64}$/u.test(value ?? '');
}

function boundedDappProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(3, Math.trunc(value)));
}

function acceptedEventAt(invitation: InviteNotificationSource): string {
  return invitation.activated_at || invitation.updated_at;
}

export function deriveUnreadInviteNotificationV2({
  invitation,
  paidReward,
  rewardReady,
  readState,
}: {
  invitation: InviteNotificationSource;
  paidReward: PaidRewardEvidence | null;
  rewardReady: RewardReadyEvidence | null;
  readState: InviteNotificationReadStateV2;
}): InviteNotificationPayloadV2 | null {
  if (
    invitation.ineligibility_check_id !== null &&
    invitation.status === 'CANCELLED' &&
    validTimestamp(invitation.ineligible_at) &&
    INVITE_NOTIFICATION_STAGE.ineligible > readState.highestStage
  ) {
    return {
      inviteCode: invitation.invite_code,
      kind: 'INVITE_INELIGIBLE',
      stage: INVITE_NOTIFICATION_STAGE.ineligible,
      eventAt: invitation.ineligible_at,
      rewardAmountWei: null,
      dappProgress: null,
      collapsedProgress: false,
    };
  }

  if (invitation.reward_status === 'FORFEITED') {
    return null;
  }

  if (
    invitation.reward_status === 'PAID' &&
    paidReward?.invite_code === invitation.invite_code &&
    paidReward.status === 'PAID' &&
    validTimestamp(paidReward.paid_at) &&
    validTransactionId(paidReward.tx_id) &&
    positiveIntegerString(paidReward.amount_wei) &&
    INVITE_NOTIFICATION_STAGE.rewardPaid > readState.highestStage
  ) {
    return {
      inviteCode: invitation.invite_code,
      kind: 'REWARD_PAID',
      stage: INVITE_NOTIFICATION_STAGE.rewardPaid,
      eventAt: paidReward.paid_at,
      rewardAmountWei: paidReward.amount_wei,
      dappProgress: null,
      collapsedProgress: false,
    };
  }

  const allMissionsObserved =
    boundedDappProgress(invitation.apps_completed) >= 3 &&
    invitation.vot3_converted === true &&
    invitation.vote_completed === true;

  // The important success notice fires only after final verification has
  // produced a durable fixed reservation. This intentionally combines
  // mission success, reward readiness and reusable-slot readiness instead of
  // showing a stale vote-complete popup followed by another success popup.
  if (
    allMissionsObserved &&
    invitation.reward_status === 'ELIGIBLE' &&
    rewardReady?.invite_code === invitation.invite_code &&
    ['AWAITING_CLAIM', 'QUEUED', 'ASSIGNED'].includes(rewardReady.status) &&
    positiveIntegerString(rewardReady.reserved_amount_wei) &&
    validTimestamp(rewardReady.reserved_at) &&
    readState.rewardReadyAcknowledgedAt === null
  ) {
    return {
      inviteCode: invitation.invite_code,
      kind: 'REWARD_READY',
      stage: INVITE_NOTIFICATION_STAGE.allMissionsCompleted,
      eventAt: rewardReady.reserved_at,
      rewardAmountWei: rewardReady.reserved_amount_wei,
      dappProgress: 3,
      collapsedProgress:
        readState.highestStage < INVITE_NOTIFICATION_STAGE.vot3Converted ||
        readState.dappProgressAcknowledged < 3,
    };
  }

  // Once all missions are visible on-chain, wait for the final verification /
  // reservation notice above. Do not replay older dApp/VOT3 milestones while
  // the referral is in the short final-check window.
  if (allMissionsObserved) {
    return null;
  }

  const appsCompleted = boundedDappProgress(invitation.apps_completed);

  if (
    appsCompleted >= 3 &&
    invitation.vot3_converted === true &&
    INVITE_NOTIFICATION_STAGE.vot3Converted > readState.highestStage
  ) {
    return {
      inviteCode: invitation.invite_code,
      kind: 'VOT3_CONVERTED',
      stage: INVITE_NOTIFICATION_STAGE.vot3Converted,
      eventAt:
        invitation.vot3_converted_at ||
        invitation.apps_completed_at ||
        invitation.updated_at,
      rewardAmountWei: null,
      dappProgress: 3,
      collapsedProgress:
        readState.dappProgressAcknowledged < 3 ||
        readState.highestStage < INVITE_NOTIFICATION_STAGE.dappMissionCompleted,
    };
  }

  if (appsCompleted > readState.dappProgressAcknowledged) {
    return {
      inviteCode: invitation.invite_code,
      kind: 'DAPP_PROGRESS',
      stage: INVITE_NOTIFICATION_STAGE.dappMissionCompleted,
      eventAt:
        invitation.apps_completed_at ||
        invitation.updated_at,
      rewardAmountWei: null,
      dappProgress: appsCompleted,
      collapsedProgress:
        appsCompleted - readState.dappProgressAcknowledged > 1,
    };
  }

  if (
    invitation.invitee_wallet &&
    !['PENDING_ACCEPTANCE', 'CANCELLED'].includes(invitation.status) &&
    INVITE_NOTIFICATION_STAGE.accepted > readState.highestStage
  ) {
    return {
      inviteCode: invitation.invite_code,
      kind: 'INVITE_ACCEPTED',
      stage: INVITE_NOTIFICATION_STAGE.accepted,
      eventAt: acceptedEventAt(invitation),
      rewardAmountWei: null,
      dappProgress: null,
      collapsedProgress: false,
    };
  }

  return null;
}

export function sortUnreadInviteNotificationsV2(
  notifications: InviteNotificationPayloadV2[],
): InviteNotificationPayloadV2[] {
  return [...notifications].sort((left, right) => {
    const timeDelta = Date.parse(right.eventAt) - Date.parse(left.eventAt);
    if (timeDelta !== 0) return timeDelta;
    if (right.stage !== left.stage) return right.stage - left.stage;
    return left.inviteCode.localeCompare(right.inviteCode);
  });
}
