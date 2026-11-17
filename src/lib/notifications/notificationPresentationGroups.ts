import type { InviteNotificationKindV2 } from './inviteNotificationStateV2';

/**
 * Eleven user-facing notification categories. The immutable, recipient-scoped
 * event kinds remain in the financial/security audit ledger, but do not create
 * nineteen competing presentation concepts.
 *
 * Never feed presentation groups back into payout, security or acknowledgement
 * RPCs: those use the original event kind and history id.
 */
export const NOTIFICATION_PRESENTATION_GROUP = {
  INVITE_ACCEPTED: 'FRIEND_PROGRESS',
  DAPP_PROGRESS: 'FRIEND_PROGRESS',
  VOT3_CONVERTED: 'FRIEND_PROGRESS',
  REWARD_READY: 'REWARD_READY',
  REWARD_PAID: 'REWARD_PAID',
  X_PROMOTION_PAID: 'X_PROMOTION_PAID',
  REWARD_ADJUSTED: 'REWARD_ADJUSTED',
  INVITE_INELIGIBLE: 'INVITE_INELIGIBLE',
  SECURITY_REVIEW_STARTED: 'SECURITY_REVIEW',
  SECURITY_POST_PAYOUT_REVIEW_STARTED: 'SECURITY_REVIEW',
  SECURITY_REVIEW_CLEARED: 'SECURITY_CLEARED',
  SECURITY_POST_PAYOUT_REVIEW_CLEARED: 'SECURITY_CLEARED',
  SECURITY_RESTRICTION_CONFIRMED: 'SECURITY_RESTRICTION',
  SECURITY_INVITER_RESTRICTED: 'SECURITY_RESTRICTION',
  SECURITY_REFERRAL_INVALIDATED: 'SECURITY_RESTRICTION',
  SECURITY_INVITER_HOLD: 'SECURITY_HOLD',
  SECURITY_INVITER_ACCESS_RESTORED: 'SECURITY_RESTORED',
  SECURITY_REFERRAL_RESTORED: 'SECURITY_RESTORED',
  SECURITY_INVITER_WATCH: null,
} as const satisfies Record<InviteNotificationKindV2, string | null>;

export function notificationPresentationGroup(
  kind: InviteNotificationKindV2,
): string | null {
  return NOTIFICATION_PRESENTATION_GROUP[kind];
}
