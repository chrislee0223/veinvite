import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/app/api/invites/[code]/mission-retry/route.ts','utf8');
const migration = readFileSync('supabase/migrations/20261117024000_mission_retry_ledger_disabled_v1.sql','utf8');

test('mission retry cannot be enabled accidentally by a database-only change',()=>{
  assert.match(route, /VEINVITE_MISSION_RETRY_READY\s*!==\s*'true'/);
  assert.match(migration, /VALUES\(1,false,126\)/);
  assert.match(migration, /IF NOT FOUND OR NOT v_cfg\.enabled THEN/);
});
test('retry endpoint restricts action to authenticated original invitee',()=>{
  assert.match(route,/requireWalletSession\(\{ request \}\)/);
  assert.match(route,/const isInvitee = row\.invitee_wallet\.toLowerCase\(\) === sessionWallet/);
  assert.match(route,/loadAuthorizedInvite\(request, context, true\)/);
  assert.match(route,/enforceRateLimits\(/);
  assert.match(route,/round\.status !== 'ACTIVE'/);
  assert.match(route,/round\.bestBlock/);
});
test('old referral proof and financial authority are not silently rewritten',()=>{
  assert.doesNotMatch(route,/\.update\(\{/);
  assert.doesNotMatch(route,/\.from\('reward_queue_entries'\)/);
  assert.doesNotMatch(route,/sendNotification|invite_notification_history|schedule|cron/i);
  assert.match(migration,/reward_status IN\('PAID','ELIGIBLE'\)/);
  assert.match(migration,/reward_queue_entries q/);
  assert.match(migration,/mission_retry_attempts_v1/);
  assert.match(migration,/LEGACY_UNBOUND_EXPIRED_REVIEW/);
});
