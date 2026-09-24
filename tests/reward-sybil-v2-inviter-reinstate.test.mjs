import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260924164500_add_sybil_v2_inviter_reinstate.sql';

test('active inviter restrictions are exposed through a service-only operator view', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /create or replace view public\.operator_sybil_v2_active_inviter_restrictions/u,
  );
  assert.match(sql, /r\.status = 'ACTIVE'/u);
  assert.match(sql, /r\.source = 'OPERATOR'/u);
  assert.match(sql, /'restrictionScope' = 'INVITER_ONLY'/u);
});

test('reinstate changes only the active restriction state and preserves history', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  const start = sql.indexOf(
    'create or replace function public.reinstate_sybil_v2_inviter_restriction',
  );
  assert.ok(start >= 0);
  const fn = sql.slice(start);

  assert.match(fn, /set status = 'REINSTATED'/u);
  assert.match(fn, /resolved_at = v_now/u);
  assert.match(fn, /'pastRewardChanged', false/u);
  assert.match(fn, /'incidentHistoryChanged', false/u);
  assert.doesNotMatch(fn, /update\s+public\.invitations/iu);
  assert.doesNotMatch(fn, /update\s+public\.sybil_v2_inviter_incidents/iu);
  assert.doesNotMatch(fn, /delete\s+from\s+public\.sybil_v2_inviter_incidents/iu);
  assert.doesNotMatch(fn, /insert\s+into\s+public\.reward_/iu);
});

test('reinstatement is operator-scoped and audited append-only', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /create table if not exists public\.sybil_v2_inviter_reinstatement_events/u,
  );
  assert.match(sql, /unique\(restriction_id\)/u);
  assert.match(
    sql,
    /before update or delete on public\.sybil_v2_inviter_reinstatement_events/u,
  );
  assert.match(sql, /INVITER_RESTRICTION_SCOPE_MISMATCH/u);
  assert.match(sql, /INVITER_REINSTATE_REASON_LENGTH/u);
});

test('admin API and UI support inviter REINSTATE only for an active restriction', async () => {
  const api = await readFile(
    'src/app/api/admin/sybil/review/route.ts',
    'utf8',
  );
  const ui = await readFile(
    'src/app/admin/sybil-review/page.tsx',
    'utf8',
  );

  assert.match(api, /operator_sybil_v2_active_inviter_restrictions/u);
  assert.match(api, /reinstate_sybil_v2_inviter_restriction/u);
  assert.match(api, /INVITER_RESTRICTION/u);
  assert.match(api, /expectedInviterRestrictionId/u);
  assert.match(ui, /INVITER RESTRICTED/u);
  assert.match(ui, /제한 해제 \/ REINSTATE/u);
  assert.match(ui, /resolveReview\('REINSTATE'\)/u);
  assert.match(ui, /inviter_active_restriction_id/u);
});
