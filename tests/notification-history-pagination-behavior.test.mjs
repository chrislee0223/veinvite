import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeLatestNotificationPage, mergeOlderNotificationPage } from '../src/lib/notifications/notificationHistoryPagination.ts';
const item = (id, readAt = null) => ({ id: String(id), readAt });
const page = (ids, cursor, unreadCount = 9) => ({ items: ids.map(id => typeof id === 'object' ? id : item(id)), nextCursor: cursor === null ? null : String(cursor), unreadCount });
const ids = result => result.items.map(row => row.id);
test('head polling preserves loaded tail, cursor and confirmed read', () => {
  const result = mergeLatestNotificationPage(page([9,item(8,'2026-11-26T00:00:00Z'),7,6,5,4],4),page([10,9,8],8,3));
  assert.deepEqual(ids(result),['10','9','8','7','6','5','4']);
  assert.equal(result.items[2].readAt,'2026-11-26T00:00:00Z');
  assert.equal(result.nextCursor,'4');
  assert.equal(result.unreadCount,3);
});
test('many new alerts reset cursor and fill gap without discarding tail', () => {
  const result = mergeLatestNotificationPage(page([6,5,4],4),page([12,11,10],10));
  assert.deepEqual(ids(result),['12','11','10','6','5','4']);
  assert.equal(result.nextCursor,'10');
  const filled=mergeOlderNotificationPage(result,page([9,8,7],7),'10');
  assert.equal(filled.nextCursor,'7');
  assert.equal(new Set(ids(filled)).size,9);
});
test('stale older-page result cannot change newer cursor or live badge', () => {
  const previous=page([9,8,7],7,2);
  assert.equal(mergeOlderNotificationPage(previous,page([5,4],4,99),'6'),previous);
  const result=mergeOlderNotificationPage(previous,page([6,5],null,99),'7');
  assert.deepEqual(ids(result),['9','8','7','6','5']);
  assert.equal(result.unreadCount,2);
  assert.equal(result.nextCursor,null);
});
test('complete first page remains authoritative', () => {
  const result=mergeLatestNotificationPage(page([9,8,7],7),page([9,8],null));
  assert.deepEqual(ids(result),['9','8']);
  assert.equal(result.nextCursor,null);
});
