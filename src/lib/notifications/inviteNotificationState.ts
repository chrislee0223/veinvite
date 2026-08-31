export const INVITE_NOTIFICATION_STAGE = {
  accepted: 1,
  dappMissionCompleted: 2,
  vot3Converted: 3,
  allMissionsCompleted: 4,
  rewardPaid: 5,
} as const;

export type InviteNotificationStage =
  (typeof INVITE_NOTIFICATION_STAGE)[keyof typeof INVITE_NOTIFICATION_STAGE];

export type InviteNotificationKind =
  | 'INVITE_ACCEPTED'
  | 'DAPP_MISSION_COMPLETED'
  | 'VOT3_CONVERTED'
  | 'ALL_MISSIONS_COMPLETED'
  | 'REWARD_PAID';

export type InviteNotificationSource = {
  invite_code: string;
  invitee_wallet: string | null;
  status: string;
  updated_at: string;
  activated_at: string | null;
  apps_completed: number;
  apps_completed_at: string | null;
  vot3_converted: boolean;
  vot3_converted_at: string | null;
  vote_completed: boolean;
  vote_completed_at: string | null;
  reward_status: string;
};

export type PaidRewardEvidence = {
  invite_code: string;
  amount_wei: string;
  status: string;
  tx_id: string | null;
  paid_at: string | null;
};

export type DerivedInviteNotification = {
  inviteCode: string;
  kind: InviteNotificationKind;
  stage: InviteNotificationStage;
  eventAt: string;
  rewardAmountWei: string | null;
};

export type UnreadInviteNotification =
  DerivedInviteNotification & {
    acknowledgedStage: number;
    collapsedProgress: boolean;
  };

function positiveIntegerString(value: string): boolean {
  return /^\d+$/u.test(value) && BigInt(value) > 0n;
}

function meaningfulEventAt(
  preferred: string | null,
  fallback: string,
): string {
  return preferred || fallback;
}

export function deriveInviteNotification(
  invitation: InviteNotificationSource,
  paidReward: PaidRewardEvidence | null,
): DerivedInviteNotification | null {
  if (invitation.reward_status === 'FORFEITED') {
    return null;
  }

  if (
    invitation.reward_status === 'PAID' &&
    paidReward?.status === 'PAID' &&
    paidReward.paid_at &&
    paidReward.tx_id &&
    positiveIntegerString(paidReward.amount_wei)
  ) {
    return {
      inviteCode: invitation.invite_code,
      kind: 'REWARD_PAID',
      stage: INVITE_NOTIFICATION_STAGE.rewardPaid,
      eventAt: paidReward.paid_at,
      rewardAmountWei: paidReward.amount_wei,
    };
  }

  if (
    invitation.vote_completed === true &&
    invitation.vote_completed_at
  ) {
    return {
      inviteCode: invitation.invite_code,
      kind: 'ALL_MISSIONS_COMPLETED',
      stage: INVITE_NOTIFICATION_STAGE.allMissionsCompleted,
      eventAt: invitation.vote_completed_at,
      rewardAmountWei: null,
    };
  }

  if (
    invitation.vot3_converted === true &&
    invitation.vot3_converted_at
  ) {
    return {
      inviteCode: invitation.invite_code,
      kind: 'VOT3_CONVERTED',
      stage: INVITE_NOTIFICATION_STAGE.vot3Converted,
      eventAt: invitation.vot3_converted_at,
      rewardAmountWei: null,
    };
  }

  if (
    invitation.apps_completed >= 3 &&
    invitation.apps_completed_at
  ) {
    return {
      inviteCode: invitation.invite_code,
      kind: 'DAPP_MISSION_COMPLETED',
      stage: INVITE_NOTIFICATION_STAGE.dappMissionCompleted,
      eventAt: invitation.apps_completed_at,
      rewardAmountWei: null,
    };
  }

  if (
    invitation.invitee_wallet &&
    ![
      'PENDING_ACCEPTANCE',
      'CANCELLED',
    ].includes(invitation.status)
  ) {
    return {
      inviteCode: invitation.invite_code,
      kind: 'INVITE_ACCEPTED',
      stage: INVITE_NOTIFICATION_STAGE.accepted,
      eventAt: meaningfulEventAt(
        invitation.activated_at,
        invitation.updated_at,
      ),
      rewardAmountWei: null,
    };
  }

  return null;
}

export function selectUnreadInviteNotification(
  entries: Array<{
    notification: DerivedInviteNotification;
    acknowledgedStage: number;
  }>,
): {
  notification: UnreadInviteNotification | null;
  unreadCount: number;
} {
  const unread = entries
    .filter(
      ({ notification, acknowledgedStage }) =>
        notification.stage > acknowledgedStage,
    )
    .sort((left, right) => {
      if (
        left.notification.stage !==
        right.notification.stage
      ) {
        return (
          right.notification.stage -
          left.notification.stage
        );
      }

      return (
        Date.parse(right.notification.eventAt) -
        Date.parse(left.notification.eventAt)
      );
    });

  const selected = unread[0];

  if (!selected) {
    return {
      notification: null,
      unreadCount: 0,
    };
  }

  return {
    notification: {
      ...selected.notification,
      acknowledgedStage:
        selected.acknowledgedStage,
      collapsedProgress:
        selected.notification.stage ===
          INVITE_NOTIFICATION_STAGE.vot3Converted &&
        selected.acknowledgedStage <
          INVITE_NOTIFICATION_STAGE.dappMissionCompleted,
    },
    unreadCount: unread.length,
  };
}
