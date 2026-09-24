import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260924152000_add_sybil_v2_inviter_escalation.sql';

test('inviter escalation is append-only and keyed by confirmed blacklisted invite', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /create table if not exists public\.sybil_v2_inviter_incidents/u);
  assert.match(sql, /unique\(network, invite_code\)/u);
  assert.match(sql, /source text not null default 'OPERATOR'/u);
  assert.match(
    sql,
    /before update or delete on public\.sybil_v2_inviter_incidents/u,
  );
  assert.match(
    sql,
    /new\.status <> 'ACTIVE'[\s\S]*new\.source <> 'OPERATOR'/u,
  );
  assert.match(
    sql,
    /lower\(i\.invitee_wallet\) = lower\(new\.wallet_address\)/u,
  );
});

test('graduated inviter policy is 1 recorded, 2 watch, 3 hold in 90 days', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  const viewStart = sql.indexOf(
    'create or replace view public.operator_sybil_v2_inviter_postures',
  );
  const holdsStart = sql.indexOf(
    'create or replace view public.operator_sybil_v2_temporary_participation_holds',
    viewStart,
  );
  assert.ok(viewStart >= 0 && holdsStart > viewStart);

  const viewSql = sql.slice(viewStart, holdsStart);
  assert.match(viewSql, /interval '90 days'/u);
  assert.match(viewSql, /incident_count_90d >= 3 then 'HOLD'/u);
  assert.match(viewSql, /incident_count_90d = 2 then 'WATCH'/u);
  assert.match(viewSql, /else 'RECORDED'/u);
});

test('single incident can hold inviter only with two independent direct-link families', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /jsonb_array_length\(direct_link_families\) >= 2/u,
  );
  assert.match(sql, /'SECURITY_CLIENT_INVITER_LINK'/u);
  assert.match(sql, /'RECENT_B3TR_FROM_INVITER'/u);
  assert.match(sql, /'RECENT_VET_FROM_INVITER'/u);
  assert.match(sql, /'RECENT_VTHO_FROM_INVITER'/u);
  assert.match(sql, /'HISTORICAL_SINK_REAPPEARS_AS_INVITER'/u);
});

test('watch posture does not enter participation hold view', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  const holdsStart = sql.indexOf(
    'create or replace view public.operator_sybil_v2_temporary_participation_holds',
  );
  assert.ok(holdsStart >= 0);
  const holds = sql.slice(holdsStart);

  assert.match(holds, /'INVITER_ESCALATION_HOLD'/u);
  assert.match(holds, /p\.posture = 'HOLD'/u);
  assert.doesNotMatch(holds, /p\.posture = 'WATCH'/u);
});

test('inviter escalation does not mutate reward or payout authority tables', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.doesNotMatch(sql, /update\s+public\.reward_/iu);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.reward_/iu);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.reward_/iu);
  assert.doesNotMatch(sql, /update\s+public\.invitations/iu);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.invitations/iu);
});

test('runtime restriction type recognizes inviter escalation hold', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/restrictions.ts',
    'utf8',
  );

  assert.match(source, /'INVITER_ESCALATION_HOLD'/u);
  assert.match(
    source,
    /operator_sybil_v2_temporary_participation_holds/u,
  );
});


test('reinstated restrictions stop counting without deleting incident history', async () => {
  const sql = await readFile(
    'supabase/migrations/20260924153500_make_inviter_escalation_reinstatement_aware.sql',
    'utf8',
  );

  assert.match(
    sql,
    /join public\.sybil_v2_wallet_restrictions r/u,
  );
  assert.match(sql, /r\.id = i\.restriction_id/u);
  assert.match(sql, /r\.status = 'ACTIVE'/u);
  assert.match(sql, /'activeRestrictionsOnly', true/u);
  assert.doesNotMatch(
    sql,
    /delete\s+from\s+public\.sybil_v2_inviter_incidents/iu,
  );
  assert.doesNotMatch(
    sql,
    /update\s+public\.sybil_v2_inviter_incidents/iu,
  );
});
