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
