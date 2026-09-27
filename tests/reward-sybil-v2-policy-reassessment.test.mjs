import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

const migrationPath =
  'supabase/migrations/20260927155839_align_sybil_v2_likelihood_review_and_policy_reassessment.sql';

test('same-client evidence stays review-only until Sybil v2 assessment', async () => {
  const sql = await read(migrationPath);
  const start = sql.indexOf(
    'create or replace function public.enforce_same_security_client_block_policy',
  );
  const end = sql.indexOf(
    'create or replace view public.operator_sybil_v2_policy_reassessment_candidates',
    start,
  );
  assert.ok(start >= 0 && end > start);
  const fn = sql.slice(start, end);

  assert.match(fn, /sameInviterClient/u);
  assert.match(fn, /new\.sybil_status := 'REVIEW'/u);
  assert.match(fn, /greatest\(coalesce\(new\.sybil_risk_score,0\), 90\)/u);
  assert.doesNotMatch(fn, /new\.sybil_status := 'BLOCKED'/u);
});

test('policy reassessment candidates are service-only, unreserved and system-owned', async () => {
  const sql = await read(migrationPath);

  assert.match(sql, /with \(security_invoker = true\)/u);
  assert.match(sql, /a\.source = 'SYSTEM'/u);
  assert.match(sql, /a\.state in \('CLEAR','WATCH'\)/u);
  assert.match(sql, /i\.reward_status = 'ELIGIBLE'/u);
  assert.match(sql, /q\.invite_code is null/u);
  assert.match(
    sql,
    /revoke all on table public\.operator_sybil_v2_policy_reassessment_candidates[\s\S]*from public, anon, authenticated/u,
  );
  assert.match(
    sql,
    /grant select on table public\.operator_sybil_v2_policy_reassessment_candidates[\s\S]*to service_role/u,
  );
});

test('runtime selects only stale policy versions for reassessment', async () => {
  const source = await read('src/lib/sybil/v2/pipeline.ts');

  assert.match(
    source,
    /operator_sybil_v2_policy_reassessment_candidates/u,
  );
  assert.match(
    source,
    /\.neq\('policy_version', SYBIL_V2_POLICY_VERSION\)/u,
  );
  assert.match(
    source,
    /runSybilV2PolicyReassessmentBatch/u,
  );
});

test('vote recovery reassesses stale policy before current assessment and reward reservation', async () => {
  const source = await read('src/app/api/cron/vote-reconcile/route.ts');

  const policy = source.indexOf(
    'await runSybilV2PolicyReassessmentBatch',
  );
  const assessment = source.indexOf(
    'await runSybilV2AssessmentBatch',
    policy,
  );
  const reservation = source.indexOf(
    'await reserveEligibleReferralRewards',
    assessment,
  );

  assert.ok(policy >= 0);
  assert.ok(assessment > policy);
  assert.ok(reservation > assessment);
});
