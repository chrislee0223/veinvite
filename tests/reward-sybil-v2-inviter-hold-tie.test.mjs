import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  'supabase/migrations/20260926041645_fix_inviter_hold_notification_tie.sql',
  'utf8',
);

test('current inviter HOLD detection no longer depends on random UUID ordering', () => {
  assert.match(
    sql,
    /operator_sybil_v2_inviter_review_candidates/u,
  );
  assert.match(
    sql,
    /c\.network = new\.network[\s\S]*c\.inviter_wallet = new\.inviter_wallet/u,
  );
  assert.doesNotMatch(
    sql,
    /c\.latest_incident_id = new\.id/u,
  );
});

test('existing unresolved HOLD suppression and WATCH behavior remain intact', () => {
  assert.match(
    sql,
    /v_previous_unresolved_hold/u,
  );
  assert.match(
    sql,
    /v_posture\.posture = 'HOLD'[\s\S]*not v_previous_unresolved_hold/u,
  );
  assert.match(
    sql,
    /v_posture\.posture = 'WATCH'[\s\S]*v_previous_count < 2/u,
  );
});

test('notification tie fix cannot mutate reward or invitation authority', () => {
  assert.doesNotMatch(
    sql,
    /update\s+public\.invitations/iu,
  );
  assert.doesNotMatch(
    sql,
    /insert\s+into\s+public\.reward_/iu,
  );
  assert.doesNotMatch(
    sql,
    /update\s+public\.reward_/iu,
  );
  assert.match(
    sql,
    /SECURITY_INVITER_HOLD/u,
  );
});
