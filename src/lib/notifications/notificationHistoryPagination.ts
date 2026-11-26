import type { InviteNotificationHistoryItem } from './inviteNotificationHistory';

export type NotificationHistoryPage = {
  items: InviteNotificationHistoryItem[];
  unreadCount: number;
  nextCursor: string | null;
  readStates?: Record<string, string>;
};
function mergeReadState(old: InviteNotificationHistoryItem | undefined, incoming: InviteNotificationHistoryItem): InviteNotificationHistoryItem {
  return old?.readAt && !incoming.readAt ? { ...incoming, readAt: old.readAt } : incoming;
}
export function mergeLatestNotificationPage(previous: NotificationHistoryPage, incoming: NotificationHistoryPage): NotificationHistoryPage {
  const known = new Map(previous.items.map(item => [
    item.id, incoming.readStates?.[item.id] ? { ...item, readAt: incoming.readStates[item.id] } : item,
  ]));
  const fresh = incoming.items.map(item => mergeReadState(known.get(item.id), item));
  if (!incoming.nextCursor || !fresh.length) return { ...incoming, items: fresh };
  const boundary = BigInt(incoming.nextCursor);
  const older = [...known.values()].filter(item => BigInt(item.id) < boundary);
  const overlaps = previous.items.some(item => BigInt(item.id) >= boundary);
  const nextCursor = overlaps && older.length > 0 &&
    (previous.nextCursor === null || BigInt(previous.nextCursor) <= boundary)
    ? previous.nextCursor : incoming.nextCursor;
  return { ...incoming, items: [...fresh, ...older], nextCursor };
}
export function mergeOlderNotificationPage(previous: NotificationHistoryPage, incoming: NotificationHistoryPage, requestedCursor: string): NotificationHistoryPage {
  if (previous.nextCursor !== requestedCursor) return previous;
  const known = new Map(previous.items.map(item => [item.id, item]));
  for (const item of incoming.items) known.set(item.id, mergeReadState(known.get(item.id), item));
  return { items: [...known.values()], unreadCount: previous.unreadCount, nextCursor: incoming.nextCursor };
}

// Rotate bounded lookups across unresolved loaded alerts, so an old alert cannot
// starve behind 100 permanently unread alerts.
export function readStateLookupIds(items: InviteNotificationHistoryItem[], sequence: number): string[] {
  const ids = items.filter(item => !item.readAt).map(item => item.id);
  if (ids.length <= 100) return ids;
  const start = ((sequence - 1) * 100) % ids.length;
  return [...ids.slice(start), ...ids.slice(0, start)].slice(0, 100);
}
