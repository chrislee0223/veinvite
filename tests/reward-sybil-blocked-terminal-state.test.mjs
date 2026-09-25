import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260925022000_fix_sybil_blocked_terminal_state.sql';

test('BLOCKED Sybil decisions end the invitation lifecycle', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /elsif p_sybil_status = 'REVIEW'[\s\S]*else[\s\S]*v_status := 'CANCELLED'/u,
  );
  assert.match(sql, /new\.sybil_status = 'BLOCKED'/u);
  assert.match(sql, /old\.reward_status <> 'PAID'/u);
  assert.match(sql, /new\.reward_status <> 'PAID'/u);
  assert.match(sql, /rp\.status = 'PAID'/u);
});

test('accepted non-Sybil invitations stay protected from cancellation', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /old\.status <> 'CANCELLED'[\s\S]*new\.status = 'CANCELLED'[\s\S]*old\.invitee_wallet is not null/u,
  );
  assert.match(
    sql,
    /raise exception 'accepted invitation cannot be cancelled'/u,
  );
});

test('operator monitor only counts actual unresolved legacy reviews', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /v_count <> 2/u);
  assert.match(
    sql,
    /where i\.status = ''UNDER_REVIEW'''[\s\S]*i\.sybil_status = ''REVIEW''/u,
  );
});

test('historical cleanup is restricted to already-finalized blocked referrals', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /i\.status = 'UNDER_REVIEW'/u);
  assert.match(sql, /i\.sybil_status = 'BLOCKED'/u);
  assert.match(sql, /i\.reward_status = 'FORFEITED'/u);
  assert.match(sql, /i\.slot_released_at is not null/u);
  assert.match(
    sql,
    /q\.status in \('AWAITING_CLAIM','QUEUED','ASSIGNED'\)/u,
  );
  assert.match(
    sql,
    /rp\.status in \('PENDING','SENDING','PAID'\)/u,
  );
});

test('terminal-state patch does not rewrite reward or payout tables', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.doesNotMatch(sql, /update\s+public\.reward_queue_entries/iu);
  assert.doesNotMatch(sql, /update\s+public\.reward_payouts/iu);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.reward_/iu);
  assert.doesNotMatch(sql, /update\s+public\.sybil_v2_/iu);
});
