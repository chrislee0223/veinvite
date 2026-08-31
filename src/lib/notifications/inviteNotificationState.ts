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

function validTransactionId(
  value: string | null,
): value is string {
  return /^0x[0-9a-f]{64}$/u.test(value ?? '');
}

function validTimestamp(
  value: string | null,
): value is string {
  return Boolean(value) && !Number.isNaN(Date.parse(value as string));
}

function meaningfulEventAt(
  preferred: string | null,
  fallback: string,
): string {
  return preferred || fallback;
}

function latestEventAt(values: string[]): string {
  let latest = values[0];

  for (const value of values.slice(1)) {
    if (Date.parse(value) > Date.parse(latest)) {
      latest = value;
    }
  }

  return latest;
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
    paidReward?.invite_code === invitation.invite_code &&
    paidReward.status === 'PAID' &&
    validTimestamp(paidReward.paid_at) &&
    validTransactionId(paidReward.tx_id) &&
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

  const dappCompletedAt =
    invitation.apps_completed >= 3
      ? invitation.apps_completed_at
      : null;
  const vot3CompletedAt = invitation.vot3_converted
    ? invitation.vot3_converted_at
    : null;
  const voteCompletedAt = invitation.vote_completed
    ? invitation.vote_completed_at
    : null;

  if (
    dappCompletedAt &&
    vot3CompletedAt &&
    voteCompletedAt
  ) {
    // The on-chain mission scanner intentionally allows conversion/vote
    // before the third dApp reward. Only call all missions complete once
    // all three user-facing milestones are actually present. Once the
    // referral is ELIGIBLE, final verification has already passed, so the
    // "final checks" notice must not be shown or replay earlier progress.
    if (invitation.reward_status !== 'PENDING') {
      return null;
    }

    return {
      inviteCode: invitation.invite_code,
      kind: 'ALL_MISSIONS_COMPLETED',
      stage: INVITE_NOTIFICATION_STAGE.allMissionsCompleted,
      eventAt: latestEventAt([
        dappCompletedAt,
        vot3CompletedAt,
        voteCompletedAt,
      ]),
      rewardAmountWei: null,
    };
  }

  if (dappCompletedAt && vot3CompletedAt) {
    return {
      inviteCode: invitation.invite_code,
      kind: 'VOT3_CONVERTED',
      stage: INVITE_NOTIFICATION_STAGE.vot3Converted,
      eventAt: latestEventAt([
        dappCompletedAt,
        vot3CompletedAt,
      ]),
      rewardAmountWei: null,
    };
  }

  if (dappCompletedAt) {
    return {
      inviteCode: invitation.invite_code,
      kind: 'DAPP_MISSION_COMPLETED',
      stage: INVITE_NOTIFICATION_STAGE.dappMissionCompleted,
      eventAt: dappCompletedAt,
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
