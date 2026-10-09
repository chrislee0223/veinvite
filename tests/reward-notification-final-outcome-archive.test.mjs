import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync('supabase/migrations/20261009115500_archive_finalized_notification_progress_v1.sql', 'utf8');
const client = readFileSync('src/components/InAppInviteNotifications.tsx', 'utf8');

test('supersession is recipient, referral, timeline, and exact terminal kind scoped', () => {
  assert.equal((sql.match(/final_outcome\.invite_code = h\.invite_code/g) || []).length, 3);
  assert.equal((sql.match(/final_outcome\.id > h\.id/g) || []).length, 3);
  assert.equal((sql.match(/final_outcome\.event_at >= h\.event_at/g) || []).length, 3);
  assert.equal((sql.match(/coalesce\(final_outcome\.recipient_wallet, final_outcome\.inviter_wallet\)/g) || []).length, 3);
});
test('read history remains immutable and paid/adjusted receipts stay visible and unread', () => {
  assert.match(sql, /coalesce\(\s*r\.read_at,/);
  assert.match(sql, /and not \(exists \(/);
  assert.doesNotMatch(sql, /(?:delete|update)\s+(?:from\s+)?public\.invite_notification_history_reads/iu);
  assert.doesNotMatch(sql, /h\.kind\s+in\s*\([^)]*'REWARD_PAID'/u);
  assert.doesNotMatch(sql, /h\.kind\s+in\s*\([^)]*'REWARD_ADJUSTED'/u);
  assert.match(sql, /'REWARD_READY'/u);
});
test('history list, unread totals and mark-all stay consistent', () => {
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\./g)||[]).length, 3);
  assert.match(sql, /get_invite_notification_history/u);
  assert.match(sql, /count_invite_notification_history_unread/u);
  assert.match(sql, /acknowledge_invite_notification_history/u);
});
test('stale v2 client read-state cache invalidated', () => {
  assert.match(client, /HISTORY_CACHE_PREFIX = 'veinvite:notification-history:v3:'/u);
});
