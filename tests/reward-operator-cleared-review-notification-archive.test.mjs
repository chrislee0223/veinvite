import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync('supabase/migrations/20261009155000_archive_operator_cleared_pending_reviews_v1.sql','utf8');
test('all three history functions share guarded operator-clear closure',()=>{
 assert.equal((source.match(/CREATE OR REPLACE FUNCTION public\./g)||[]).length,3);
 for(const needle of [
 "resolved_review.state = 'CLEAR'",
 "resolved_review.reason_codes @> '[\"OPERATOR_CLEARED\"]'::jsonb",
 "inv.sybil_status <> 'BLOCKED'",
 "inv.reward_status <> 'FORFEITED'",
 "block.status = 'ACTIVE'",
 "later.kind = 'SECURITY_REVIEW_STARTED'",
 "h.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-r%'"
 ]) assert.ok(source.split(needle).length>=4, 'guard missing in one RPC: '+needle);
});
test('history represents ended review without updating immutable audits or claiming a reward',()=>{
 assert.match(source,/then 'SECURITY_REVIEW_CLEARED' else/);
 assert.match(source,/greatest\(resolved_review.updated_at, h.event_at\)/);
 assert.doesNotMatch(source,/\b(?:update|delete)\s+(?:from\s+)?public\.(?:invitations|reward_payouts|invite_notification_history_reads|invite_notification_history|sybil_v2_referral_assessments)\b/i);
 assert.doesNotMatch(source,/\binsert\s+into\s+public\.(?:invitations|reward_payouts|invite_notification_history|sybil_v2_referral_assessments)\b/i);
 // The unchanged acknowledgement RPC intentionally inserts actual user-read receipts.
 assert.equal((source.match(/insert into public\.invite_notification_history_reads/g)||[]).length,1);
});