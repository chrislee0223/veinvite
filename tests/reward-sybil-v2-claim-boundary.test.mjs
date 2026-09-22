import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260923024500_harden_sybil_v2_claim_boundary.sql';

test('v2 Claim uses immutable queue clearance instead of mutable Sybil state', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const claimStart = sql.indexOf(
    'create or replace function public.request_reward_claim',
  );
  const gateStart = sql.indexOf(
    'create or replace function public.enforce_reward_queue_identity_gate',
  );

  assert.ok(claimStart >= 0 && gateStart > claimStart);

  const claimSql = sql.slice(claimStart, gateStart);
  const v2Start = claimSql.indexOf(
    'if v_queue.sybil_clearance_id is not null then',
  );
  const legacyStart = claimSql.indexOf(
    'else\n    -- Legacy queue entries',
    v2Start,
  );

  assert.ok(v2Start >= 0 && legacyStart > v2Start);

  const v2Branch = claimSql.slice(v2Start, legacyStart);
  assert.match(v2Branch, /sybil_v2_reward_clearances/u);
  assert.doesNotMatch(v2Branch, /v_invitation\./u);
  assert.doesNotMatch(v2Branch, /sybil_status/u);
  assert.doesNotMatch(v2Branch, /identity_link/u);
});

test('v2 queue identity gate never re-opens a valid pre-Claim clearance', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const gateStart = sql.indexOf(
    'create or replace function public.enforce_reward_queue_identity_gate',
  );
  const validationStart = sql.indexOf(
    'create or replace function public.validate_sybil_v2_reward_queue_clearance',
  );

  assert.ok(gateStart >= 0 && validationStart > gateStart);

  const gateSql = sql.slice(gateStart, validationStart);
  assert.match(
    gateSql,
    /if new\.sybil_clearance_id is not null then/u,
  );
  assert.match(gateSql, /return new;/u);
  assert.match(
    gateSql,
    /REWARD_QUEUE_SYBIL_V2_CLEARANCE_INVALID/u,
  );
});

test('claim-ready invitation reward authority is frozen until PAID', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /zzzz_invitations_freeze_v2_claim_authority/u,
  );
  assert.match(
    sql,
    /q\.status in \('AWAITING_CLAIM','QUEUED','ASSIGNED'\)/u,
  );
  assert.match(
    sql,
    /if new\.reward_status <> 'PAID' then/u,
  );
  assert.match(sql, /new\.sybil_status := old\.sybil_status;/u);
});

test('post-Claim VePassport refresh excludes v2-cleared queue rows', async () => {
  const source = await readFile(
    'src/lib/sybil/vePassportSignals.ts',
    'utf8',
  );

  assert.match(
    source,
    /\.is\('sybil_clearance_id', null\)/u,
  );
});

test('reward action visibility follows immutable v2 clearance', async () => {
  const source = await readFile(
    'src/app/api/notifications/reward-actions/route.ts',
    'utf8',
  );

  assert.match(source, /sybil_clearance_id/u);
  assert.match(source, /validV2ClearanceById/u);
  assert.match(source, /hasValidV2Authority/u);
  assert.match(source, /legacyAuthority/u);
});

test('reward pricing excludes referrals without current v2 clearance', async () => {
  const source = await readFile(
    'src/lib/rewards/predictivePlanning.ts',
    'utf8',
  );

  assert.match(
    source,
    /read_sybil_v2_cleared_unreserved_count/u,
  );
  assert.match(
    source,
    /queuedEligibleCount: clearedQueuedEligibleCount/u,
  );
});
