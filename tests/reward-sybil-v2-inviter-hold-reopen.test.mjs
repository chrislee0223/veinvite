import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260924174500_fix_inviter_hold_reopen_notification.sql';

test('inviter HOLD notification follows unresolved review snapshots, not posture alone', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /v_previous_latest_incident_id uuid := null/u,
  );
  assert.match(
    sql,
    /v_previous_unresolved_hold boolean := false/u,
  );
  assert.match(
    sql,
    /v_current_unresolved_hold boolean := false/u,
  );
  assert.match(
    sql,
    /operator_sybil_v2_inviter_review_candidates/u,
  );
  assert.match(
    sql,
    /d\.latest_incident_id = v_previous_latest_incident_id/u,
  );
});

test('an already unresolved HOLD is not repeated', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /v_posture\.posture = 'HOLD'[\s\S]*v_current_unresolved_hold[\s\S]*not v_previous_unresolved_hold/u,
  );
});

test('a new incident after operator CLEAR can emit a fresh HOLD notification', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /not exists \([\s\S]*sybil_v2_inviter_review_decisions d[\s\S]*d\.latest_incident_id = v_previous_latest_incident_id/u,
  );
  assert.match(
    sql,
    /'SECURITY_INVITER_HOLD'/u,
  );
  assert.match(
    sql,
    /'inviter-hold-' \|\| new\.id::text/u,
  );
});

test('WATCH transition behavior stays intact', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /v_posture\.posture = 'WATCH'[\s\S]*v_previous_count < 2/u,
  );
  assert.match(sql, /'SECURITY_INVITER_WATCH'/u);
});

test('notification patch cannot mutate reward or invitation authority', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.doesNotMatch(sql, /update\s+public\.invitations/iu);
  assert.doesNotMatch(sql, /update\s+public\.reward_/iu);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.reward_/iu);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.sybil_v2_inviter_incidents/iu);
});
