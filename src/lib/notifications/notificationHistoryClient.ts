import type {
  InviteNotificationHistoryItem,
} from './inviteNotificationHistory';

export function newestHistoryId(
  items: InviteNotificationHistoryItem[],
): string | null {
  let latest: bigint | null = null;

  for (const item of items) {
    try {
      const id = BigInt(item.id);
      if (id > 0n && (latest === null || id > latest)) {
        latest = id;
      }
    } catch {
      // Invalid server ids are rejected by the history API.
    }
  }

  return latest?.toString() ?? null;
}

export function newestUnreadSecurityHistoryId(
  items: InviteNotificationHistoryItem[],
): string | null {
  return newestHistoryId(
    items.filter((item) => {
      const kind = item.presentationKind ?? item.kind;
      return item.readAt === null && kind.startsWith('SECURITY_');
    }),
  );
}

export function effectiveNotificationKind(
  notification: InviteNotificationHistoryItem,
): string {
  return notification.presentationKind ?? notification.kind;
}

export function notificationRequiresHomeRefresh(
  notification: InviteNotificationHistoryItem,
): boolean {
  const kind = effectiveNotificationKind(notification);
  return (
    kind === 'INVITE_INELIGIBLE' ||
    kind === 'REWARD_READY' ||
    kind === 'REWARD_PAID' ||
    kind === 'REWARD_ADJUSTED' ||
    kind === 'SECURITY_RESTRICTION_CONFIRMED' ||
    kind === 'SECURITY_REVIEW_CLEARED' ||
    kind === 'SECURITY_REFERRAL_INVALIDATED' ||
    kind === 'SECURITY_REFERRAL_RESTORED'
  );
}

export function notificationRequiresNetworkRefresh(
  notification: InviteNotificationHistoryItem,
): boolean {
  const kind = effectiveNotificationKind(notification);
  return (
    kind === 'REWARD_ADJUSTED' ||
    kind === 'SECURITY_RESTRICTION_CONFIRMED' ||
    kind === 'SECURITY_REVIEW_CLEARED' ||
    kind === 'SECURITY_REFERRAL_INVALIDATED' ||
    kind === 'SECURITY_REFERRAL_RESTORED'
  );
}
