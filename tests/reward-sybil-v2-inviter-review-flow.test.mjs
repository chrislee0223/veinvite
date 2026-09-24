import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260924160000_add_sybil_v2_inviter_review_flow.sql';

test('inviter escalation HOLD has an explicit operator review snapshot', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /create table if not exists public\.sybil_v2_inviter_review_decisions/u,
  );
  assert.match(
    sql,
    /create or replace view public\.operator_sybil_v2_inviter_review_candidates/u,
  );
  assert.match(sql, /p\.posture = 'HOLD'/u);
  assert.match(sql, /d\.latest_incident_id = p\.latest_incident_id/u);
  assert.match(
    sql,
    /'INVITER_ESCALATION_HOLD'/u,
  );
});

test('operator can clear a HOLD snapshot or restrict only the inviter', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  const start = sql.indexOf(
    'create or replace function public.resolve_sybil_v2_inviter_review',
  );
  assert.ok(start >= 0);
  const fn = sql.slice(start);

  assert.match(fn, /v_decision not in \('CLEAR','RESTRICT'\)/u);
  assert.match(fn, /'restrictionScope', 'INVITER_ONLY'/u);
  assert.match(fn, /wallet_address,\s*network,\s*status/iu);
  assert.match(fn, /v_inviter,\s*v_network,\s*'ACTIVE'/u);
  assert.match(fn, /'pastRewardChanged', false/u);
  assert.doesNotMatch(fn, /update\s+public\.invitations/iu);
  assert.doesNotMatch(fn, /insert\s+into\s+public\.reward_/iu);
});

test('clear releases only the reviewed snapshot so a later incident can reopen review', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /unique\(network, inviter_wallet, latest_incident_id\)/u,
  );
  assert.match(
    sql,
    /d\.latest_incident_id = p\.latest_incident_id/u,
  );
  assert.doesNotMatch(
    sql,
    /delete\s+from\s+public\.sybil_v2_inviter_incidents/iu,
  );
  assert.doesNotMatch(
    sql,
    /update\s+public\.sybil_v2_inviter_incidents/iu,
  );
});

test('operator monitoring surfaces unresolved inviter HOLDs', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /SYBIL_V2_INVITER_REVIEW_REQUIRED/u);
  assert.match(sql, /SYBIL_V2_INVITER_REVIEW_OVER_24H/u);
  assert.match(sql, /SYBIL_V2_INVITER_REVIEW_OVER_48H/u);
  assert.match(sql, /'openReviews'/u);
  assert.match(sql, /'openReviewsOver24h'/u);
  assert.match(sql, /'openReviewsOver48h'/u);
});

test('admin API exposes and resolves inviter escalation reviews', async () => {
  const source = await readFile(
    'src/app/api/admin/sybil/review/route.ts',
    'utf8',
  );

  assert.match(
    source,
    /operator_sybil_v2_inviter_review_candidates/u,
  );
  assert.match(source, /reviewMode: inviterCanResolve/u);
  assert.match(source, /\? 'INVITER'/u);
  assert.match(source, /expectedInviterIncidentId/u);
  assert.match(source, /resolve_sybil_v2_inviter_review/u);
  assert.match(source, /\? 'RESTRICT'/u);
});

test('admin UI explains inviter and invitee consequences separately', async () => {
  const source = await readFile(
    'src/app/admin/sybil-review/page.tsx',
    'utf8',
  );

  assert.match(source, /detail\.reviewMode === 'INVITER'/u);
  assert.match(source, /초대자 제한 \/ RESTRICT/u);
  assert.match(source, /inviter_escalation_latest_incident_id/u);
  assert.match(source, /초대받은 지갑의 향후 VeInvite 참여가 제한됩니다/u);
  assert.match(source, /초대자는 90일 반복 적발 정책으로 별도 평가됩니다/u);
  assert.doesNotMatch(
    source,
    /초대자·초대받은 지갑의 향후 VeInvite 참여를 제한/u,
  );
});
