import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const batchMigration = await readFile(
  new URL(
    '../supabase/migrations/20260905114500_make_notification_ack_batch_atomic.sql',
    import.meta.url,
  ),
  'utf8',
);
const ackMigration = await readFile(
  new URL(
    '../supabase/migrations/20260904095000_add_notification_progress_ack_v2.sql',
    import.meta.url,
  ),
  'utf8',
);
const route = await readFile(
  new URL('../src/app/api/notifications/route.ts', import.meta.url),
  'utf8',
);

test('notification acknowledgement batches run inside one database RPC', () => {
  assert.match(
    batchMigration,
    /create or replace function public\.acknowledge_invite_notifications_v2_batch\(/,
  );
  assert.match(batchMigration, /jsonb_array_elements\(p_items\)/);
  assert.match(
    batchMigration,
    /public\.acknowledge_invite_notification_v2\(/,
  );
  assert.match(
    route,
    /\.rpc\(\s*'acknowledge_invite_notifications_v2_batch'/,
  );
  assert.doesNotMatch(
    route,
    /\.rpc\(\s*'acknowledge_invite_notification_v2'/,
  );
});

test('batch acknowledgement keeps the browser away from the database RPC', () => {
  assert.match(
    batchMigration,
    /revoke all on function public\.acknowledge_invite_notifications_v2_batch\(text,jsonb\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    batchMigration,
    /grant execute on function public\.acknowledge_invite_notifications_v2_batch\(text,jsonb\)[\s\S]*to service_role/,
  );
});

test('the API validates current state but accepts a retry that was already monotonically acknowledged', () => {
  assert.match(route, /acknowledgementMatchesCurrent\(requested, current\)/);
  assert.match(route, /acknowledgementAlreadySatisfied\(requested, readState\)/);
  assert.match(route, /state\.highestStage >= requested\.stage/);
  assert.match(
    route,
    /state\.dappProgressAcknowledged >= requested\.dappProgress/,
  );
  assert.match(route, /state\.rewardReadyAcknowledgedAt !== null/);
  assert.match(route, /rpcItemForAcknowledgement\(requested\)/);
  assert.match(route, /p_inviter_wallet: wallet/);
  assert.match(route, /p_items: items/);
  assert.match(route, /states\.length !== items\.length/);
});

test('a retry cannot regress newer notification state', () => {
  assert.match(
    ackMigration,
    /highest_stage = greatest\(\s*public\.invite_notification_state\.highest_stage,\s*excluded\.highest_stage\s*\)/,
  );
  assert.match(
    ackMigration,
    /dapp_progress_acknowledged = greatest\(\s*public\.invite_notification_state\.dapp_progress_acknowledged,\s*excluded\.dapp_progress_acknowledged\s*\)/,
  );
  assert.match(
    ackMigration,
    /coalesce\(\s*public\.invite_notification_state\.reward_ready_acknowledged_at,\s*now\(\)\s*\)/,
  );
  assert.match(
    route,
    /partialDappProgress[\s\S]*\? null[\s\S]*: acknowledgement\.stage/,
  );
});
