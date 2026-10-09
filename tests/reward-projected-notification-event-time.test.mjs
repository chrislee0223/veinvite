import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync('supabase/migrations/20261009193500_project_terminal_notification_event_time_v1.sql','utf8');
const client = readFileSync('src/components/InAppInviteNotifications.tsx','utf8');

test('only projection-changed reviews get the real terminal outcome timestamp',()=>{
  assert.match(sql,/with history_page as materialized/);
  assert.match(sql,/h.kind as recorded_kind/);
  assert.match(sql,/history_page.recorded_kind = 'SECURITY_REVIEW_STARTED'[\s\S]*?history_page.kind = 'SECURITY_REVIEW_CLEARED'/);
  assert.match(sql,/select resolved_review.updated_at/);
  assert.match(sql,/history_page.recorded_kind = 'SECURITY_REVIEW_STARTED'[\s\S]*?history_page.kind = 'INVITE_INELIGIBLE'/);
  assert.match(sql,/select terminal_invite.slot_released_at/);
  assert.match(sql,/else history_page.event_at/);
  assert.match(sql,/from history_page\s+order by history_page.id desc/);
});

test('does not alter history, read receipts, financial or Sybil rows',()=>{
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
  assert.doesNotMatch(sql,/\\b(?:insert\\s+into|update|delete\\s+from)\\s+public\\.(?:invitations|invite_notification_history|invite_notification_history_reads|reward_payouts|reward_receipts|sybil_v2_referral_assessments)\\b/i);
  assert.match(sql,/left join public.invite_notification_history_reads r/);
  assert.match(sql,/history_page.read_at/);
});

test('bumps client history cache version after changing projected dates',()=>{
  assert.match(client,/HISTORY_CACHE_PREFIX = 'veinvite:notification-history:v6:'/);
});
