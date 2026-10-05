import type {
  InviteNotificationKindV2,
} from './inviteNotificationStateV2';

export type NotificationReadBehavior =
  | 'tap'
  | 'receipt'
  | 'none';

export type NotificationTransientSurface =
  | 'none'
  | 'reward-paid';

export type NotificationDeliveryPolicy =
  | {
      userVisible: true;
      showInHistory: true;
      autoOpenHistory: false;
      transientSurface: 'none';
      readBehavior: 'tap';
    }
  | {
      userVisible: true;
      showInHistory: true;
      autoOpenHistory: false;
      transientSurface: 'reward-paid';
      readBehavior: 'receipt';
    }
  | {
      userVisible: false;
      showInHistory: false;
      autoOpenHistory: false;
      transientSurface: 'none';
      readBehavior: 'none';
    };

const HISTORY_TAP: NotificationDeliveryPolicy = {
  userVisible: true,
  showInHistory: true,
  autoOpenHistory: false,
  transientSurface: 'none',
  readBehavior: 'tap',
};

const HISTORY_SECURITY: NotificationDeliveryPolicy = {
  ...HISTORY_TAP,
  readBehavior: 'tap',
};

export const NOTIFICATION_POLICY: Record<
  InviteNotificationKindV2,
  NotificationDeliveryPolicy
> = {
  INVITE_ACCEPTED: HISTORY_TAP,
  DAPP_PROGRESS: HISTORY_TAP,
  VOT3_CONVERTED: HISTORY_TAP,
  REWARD_READY: HISTORY_TAP,
  REWARD_PAID: {
    userVisible: true,
    showInHistory: true,
    autoOpenHistory: false,
    transientSurface: 'reward-paid',
    readBehavior: 'receipt',
  },
  REWARD_ADJUSTED: HISTORY_TAP,
  INVITE_INELIGIBLE: HISTORY_TAP,
  SECURITY_REVIEW_STARTED: HISTORY_SECURITY,
  SECURITY_REVIEW_CLEARED: HISTORY_SECURITY,
  SECURITY_POST_PAYOUT_REVIEW_STARTED: HISTORY_SECURITY,
  SECURITY_POST_PAYOUT_REVIEW_CLEARED: HISTORY_SECURITY,
  SECURITY_RESTRICTION_CONFIRMED: HISTORY_SECURITY,
  SECURITY_INVITER_WATCH: {
    userVisible: false,
    showInHistory: false,
    autoOpenHistory: false,
    transientSurface: 'none',
    readBehavior: 'none',
  },
  SECURITY_INVITER_HOLD: HISTORY_SECURITY,
  SECURITY_INVITER_RESTRICTED: HISTORY_SECURITY,
  SECURITY_INVITER_ACCESS_RESTORED: HISTORY_SECURITY,
  SECURITY_REFERRAL_INVALIDATED: HISTORY_SECURITY,
  SECURITY_REFERRAL_RESTORED: HISTORY_SECURITY,
};

export const TRANSIENT_FEEDBACK_POLICY = {
  position: 'bottom',
  durableHistory: false,
  purposes: [
    'user-action-success',
    'user-action-error',
    'short-processing-feedback',
  ],
} as const;
