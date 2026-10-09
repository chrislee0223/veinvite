import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration=readFileSync('supabase/migrations/20261009124500_close_legacy_notification_outcomes_v1.sql','utf8');
const client=readFileSync('src/components/InAppInviteNotifications.tsx','utf8');

test('the three RPCs archive old review, hold, and progress after authoritative security outcomes',()=>{
 assert.equal((migration.match(/CREATE OR REPLACE FUNCTION public\./g)||[]).length,3);
 assert.equal((migration.match(/final_outcome\.kind in \('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED', 'SECURITY_REFERRAL_INVALIDATED'\)/g)||[]).length,3);
 assert.equal((migration.match(/final_outcome\.kind in \('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED', 'SECURITY_REFERRAL_INVALIDATED'\)/g)||[]).length,3);
 assert.equal((migration.match(/final_outcome\.kind in \('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REFERRAL_INVALIDATED'\)/g)||[]).length,3);
 assert.equal((migration.match(/terminal_invite\.status = 'CANCELLED'/g)||[]).length,4);
 assert.equal((migration.match(/terminal_invite\.reward_status = 'FORFEITED'/g)||[]).length,4);
 assert.equal((migration.match(/terminal_invite\.slot_released_at is not null/g)||[]).length,4);
});
test('historical preclaim BLACK reviews show completed invite copy without new notification writes',()=>{
 assert.match(migration,/then 'INVITE_INELIGIBLE' else h\.kind end as kind/);
 assert.match(migration,/h\.dedupe_key like 'security-v2:%:SECURITY_REVIEW_STARTED:preclaim-%'/);
 assert.match(migration,/explicit_outcome\.id > h\.id/);
 assert.doesNotMatch(migration,/\b(?:insert|update|delete)\s+(?:from\s+)?public\.invite_notification_history\b/i);
});
test('reward receipts and read audit are not rewritten, v4 cache invalidates stale projections',()=>{
 assert.doesNotMatch(migration,/\b(?:update|delete)\s+(?:from\s+)?public\.invite_notification_history_reads\b/i);
 assert.doesNotMatch(migration,/h\.kind in \([^)]*'REWARD_PAID'/);
 assert.match(client,/HISTORY_CACHE_PREFIX = 'veinvite:notification-history:v6:'/);
});
