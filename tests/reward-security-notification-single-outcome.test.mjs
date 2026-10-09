import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20261009015300_single_blacklist_notification_outcome.sql');
const notificationRoute = read('src/app/api/notifications/route.ts');
const historyRoute = read('src/app/api/notifications/history/route.ts');
const ui = read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');
const historyType = read('src/lib/notifications/inviteNotificationHistory.ts');
const controller = read('src/components/InAppInviteNotifications.tsx');

test('blacklisted forfeitures do not create a second generic ineligible alert', () => {
  assert.match(notificationRoute, /invitation\.sybil_status === 'BLOCKED'/u);
  assert.match(notificationRoute, /invitation\.reward_status === 'FORFEITED'/u);
  assert.match(notificationRoute, /: deriveUnreadInviteNotificationV2/u);
});
test('existing duplicate history is hidden consistently from list, unread count, and reads', () => {
  const duplicates = migration.match(/h\.kind = 'INVITE_INELIGIBLE'/gu) ?? [];
  const siblingOutcomes = migration.match(/security_outcome\.kind = 'SECURITY_RESTRICTION_CONFIRMED'/gu) ?? [];
  assert.equal(duplicates.length, 3);
  assert.equal(siblingOutcomes.length, 3);
  assert.match(migration, /get_invite_notification_history/u);
  assert.match(migration, /count_invite_notification_history_unread/u);
  assert.match(migration, /acknowledge_invite_notification_history/u);
  assert.doesNotMatch(migration, /delete from public\.invite_notification_history/iu);
  assert.doesNotMatch(migration, /update public\.invite_notification_history_reads/iu);
});
test('security copy differentiates inviter from restricted invitee', () => {
  assert.match(historyRoute, /recipientRole: rawKind === 'SECURITY_RESTRICTION_CONFIRMED'/u);
  assert.match(historyRoute, /inviterByCode\.get\(row\.invite_code\) === wallet/u);
  assert.match(historyType, /recipientRole\?: 'inviter' \| 'invitee'/u);
  assert.match(ui, /item\.recipientRole === 'inviter'/u);
  assert.match(ui, /title: ineligible\.title, body: ineligible\.body/u);
  assert.match(ui, /title: security\.restrictionTitle/u);
});
test('cached history invalidates older role and supersession states', () => {
  assert.match(controller, /HISTORY_CACHE_PREFIX = 'veinvite:notification-history:v5:'/u);
});
