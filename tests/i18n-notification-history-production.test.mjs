import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const locales = read('src/lib/i18n/locales.ts');
const copy = read('src/lib/i18n/notificationHistoryCopy.ts');
const center = read('src/components/InviteNotificationHistoryCenter.tsx');
const controller = read('src/components/InAppInviteNotifications.tsx');
const unreadRoute = read('src/app/api/notifications/route.ts');
const historyRoute = read('src/app/api/notifications/history/route.ts');
const receiptRoute = read('src/app/api/rewards/receipts/[id]/seen/route.ts');
const migration = read('supabase/migrations/20260904214500_add_persistent_notification_history.sql');
const backfill = read('supabase/migrations/20260904214600_backfill_persistent_notification_history.sql');
const manifest = read('supabase/production-migration-manifest.txt');

const supportedLocales = [...locales.matchAll(/\{ locale: '([^']+)'/g)]
  .map((match) => match[1]);
const translatedLocales = [...copy.matchAll(
  /^\s*(?:'([^']+)'|([a-z]+)):\s*\{/gmu,
)]
  .map((match) => match[1] ?? match[2])
  .filter((locale) => supportedLocales.includes(locale));

test('notification history chrome is explicitly translated for all supported locales', () => {
  assert.ok(supportedLocales.length >= 27);
  assert.equal(new Set(supportedLocales).size, supportedLocales.length);
  assert.equal(translatedLocales.length, supportedLocales.length);
  assert.deepEqual(
    [...new Set(translatedLocales)].sort(),
    [...supportedLocales].sort(),
  );
  for (const field of [
    'markAll',
    'today',
    'yesterday',
    'earlier',
    'emptyTitle',
    'loadingTitle',
    'errorTitle',
    'retry',
  ]) {
    assert.match(copy, new RegExp(`${field}:`));
  }
});

test('persistent history is append-only, deduplicated and service-role scoped', () => {
  assert.match(migration, /create table public\.invite_notification_history/);
  assert.match(migration, /dedupe_key text not null unique/);
  assert.match(migration, /invite_notification_history_append_only/);
  assert.match(migration, /invite_notification_history_reads_append_only/);
  assert.match(migration, /raise exception 'invite notification history is append-only'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.invite_notification_history from anon, authenticated/);
  assert.match(migration, /record_invite_notification_history/);
  assert.match(migration, /get_invite_notification_history/);
  assert.match(migration, /count_invite_notification_history_unread/);
  assert.match(migration, /acknowledge_invite_notification_history/);
});

test('mark all uses an open-snapshot watermark so newer alerts stay unread', () => {
  assert.match(migration, /p_through_id bigint default null/);
  assert.match(migration, /h\.id <= p_through_id/);
  assert.match(controller, /openSnapshotRef/);
  assert.match(controller, /newestHistoryId/);
  assert.match(controller, /acknowledge\(\{ throughId \}\)/);
  assert.match(controller, /historyIdAtOrBefore/);
});

test('history API remains wallet-scoped, no-store and same-origin for mutations', () => {
  assert.match(historyRoute, /requireWalletSession/);
  assert.match(historyRoute, /sameOrigin\(request\)/);
  assert.match(historyRoute, /Cache-Control': 'no-store'/);
  assert.match(historyRoute, /get_invite_notification_history/);
  assert.match(historyRoute, /count_invite_notification_history_unread/);
  assert.match(historyRoute, /acknowledge_invite_notification_history/);
  assert.match(historyRoute, /MAX_ACKNOWLEDGEMENTS = 100/);
  assert.match(historyRoute, /id: String\(row\.id\)/);
});

test('current V2 notifications are materialized without reconstructing raw event history', () => {
  assert.match(unreadRoute, /record_invite_notification_history/);
  assert.match(unreadRoute, /p_kind: notification\.kind/);
  assert.match(unreadRoute, /p_event_at: notification\.eventAt/);
  assert.match(unreadRoute, /p_friend_wallet:/);
  assert.match(controller, /fetch\(\s*'\/api\/notifications'/);
  assert.match(controller, /\/api\/notifications\/history/);
});

test('production notification center keeps empty history, read states and accessibility complete', () => {
  assert.match(center, /unreadCount > 99 \? '99\+'/);
  assert.match(center, /isUnread/);
  assert.match(center, /isRead/);
  assert.match(center, /structure\.emptyTitle/);
  assert.match(center, /structure\.loadingTitle/);
  assert.match(center, /structure\.errorTitle/);
  assert.match(center, /isRtlLocale/);
  assert.match(center, /env\(safe-area-inset-bottom\)/);
  assert.match(center, /prefers-reduced-motion:reduce/);
  assert.match(center, /event\.key === 'Escape'/);
  assert.match(center, /FOCUSABLE_SELECTOR/);
  assert.match(center, /aria-modal="true"/);
});

test('reward receipt acknowledgement also reads the matching persistent paid notification', () => {
  assert.match(receiptRoute, /record_invite_notification_history/);
  assert.match(receiptRoute, /p_kind: 'REWARD_PAID'/);
  assert.match(receiptRoute, /acknowledge_invite_notification_history/);
  assert.match(receiptRoute, /INVITE_NOTIFICATION_STAGE\.rewardPaid/);
});

test('notification history migrations are recorded in production manifest and preserve prior read state', () => {
  assert.match(manifest, /20260904214500_add_persistent_notification_history\.sql/);
  assert.match(manifest, /20260904214600_backfill_persistent_notification_history\.sql/);
  assert.match(backfill, /invite_notification_state/);
  assert.match(backfill, /invite_notification_history_reads/);
  assert.match(backfill, /on conflict \(notification_id\) do nothing/);
});
