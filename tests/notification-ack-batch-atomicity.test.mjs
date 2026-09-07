import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20260905114500_make_notification_ack_batch_atomic.sql',
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
    migration,
    /create or replace function public\.acknowledge_invite_notifications_v2_batch\(/,
  );
  assert.match(migration, /jsonb_array_elements\(p_items\)/);
  assert.match(
    migration,
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
    migration,
    /revoke all on function public\.acknowledge_invite_notifications_v2_batch\(text,jsonb\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
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
    migration,
    /highest_stage = greatest\(public\.invite_notification_state\.highest_stage,excluded\.highest_stage\)/,
  );
  assert.match(
    migration,
    /dapp_progress_acknowledged = greatest\(public\.invite_notification_state\.dapp_progress_acknowledged,excluded\.dapp_progress_acknowledged\)/,
  );
  assert.match(
    migration,
    /coalesce\(public\.invite_notification_state\.reward_ready_acknowledged_at,now\(\)\)/,
  );
  assert.match(
    route,
    /partialDappProgress[\s\S]*\? null[\s\S]*: acknowledgement\.stage/,
  );
});
