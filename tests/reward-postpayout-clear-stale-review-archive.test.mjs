import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync('supabase/migrations/20261009121000_archive_postpayout_clear_review_alerts_v1.sql','utf8');

test('all three functions use the same exact post-payout review and CLEAR key pair',()=>{
  assert.equal((sql.match(/h\.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:postpayout-r%'/g)||[]).length,3);
  assert.equal((sql.match(/final_outcome\.dedupe_key like 'security-v2:%:SECURITY_INVITER_ACCESS_RESTORED:postpayout-clear-r%'/g)||[]).length,3);
  assert.equal((sql.match(/final_outcome\.id > h\.id/g)||[]).length,3);
  assert.equal((sql.match(/final_outcome\.event_at >= h\.event_at/g)||[]).length,3);
  assert.equal((sql.match(/final_outcome\.invite_code = h\.invite_code/g)||[]).length,3);
  assert.equal((sql.match(/final_outcome\.recipient_wallet, final_outcome\.inviter_wallet/g)||[]).length,3);
});
test('paid notifications and immutable genuine read rows preserved',()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.get_invite_notification_history/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.count_invite_notification_history_unread/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.acknowledge_invite_notification_history/);
  assert.doesNotMatch(sql,/\b(?:update|delete)\s+(?:from\s+)?public\.invite_notification_history(?:_reads)?\b/i);
  assert.match(sql,/h\.kind in \('INVITE_ACCEPTED', 'DAPP_PROGRESS', 'VOT3_CONVERTED', 'REWARD_READY'\)/);
  assert.doesNotMatch(sql,/h\.kind in \([^)]*'REWARD_PAID'/);
});
