import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policy = await readFile('src/lib/sybil/v2/policy.ts', 'utf8');
const pipeline = await readFile('src/lib/sybil/v2/pipeline.ts', 'utf8');
const migration = await readFile(
  'supabase/migrations/20260928190000_retire_sybil_watch_reward_state.sql',
  'utf8',
);

test('Sybil v2.10 policy never emits WATCH for a new reward decision', () => {
  assert.match(policy, /SYBIL_V2_POLICY_VERSION = 'sybil-v2\\.10'/u);

  const evaluateStart = policy.indexOf(
    'export function evaluateSybilV2Policy',
  );
  assert.ok(evaluateStart >= 0);
  const evaluateBody = policy.slice(evaluateStart);

  assert.doesNotMatch(
    evaluateBody,
    /state:\s*'WATCH'/u,
  );
  assert.match(
    evaluateBody,
    /highEvidenceDomains\.length >= 1/u,
  );
  assert.match(
    evaluateBody,
    /strongEvidenceDomains\.length >= 2/u,
  );
});

test('runtime issues reward clearance only for CLEAR', () => {
  assert.match(
    pipeline,
    /invitation\.reward_status !== 'PAID'[\s\S]{0,160}policy\.state === 'CLEAR'/u,
  );
  assert.doesNotMatch(
    pipeline,
    /policy\.state === 'CLEAR' \|\| policy\.state === 'WATCH'/u,
  );
});

test('database forbids future non-CLEAR reward clearances while preserving legacy rows', () => {
  assert.match(
    migration,
    /check \(verdict = 'CLEAR'\) not valid/u,
  );
  assert.match(
    migration,
    /Historical WATCH rows remain unvalidated audit history/u,
  );
});

test('active reward queue authority requires current CLEAR assessment and clearance', () => {
  assert.match(
    migration,
    /REWARD_QUEUE_SYBIL_V2_CLEAR_ONLY_REQUIRED/u,
  );
  assert.match(
    migration,
    /a\.state = 'CLEAR'/u,
  );
  assert.match(
    migration,
    /c\.verdict = 'CLEAR'/u,
  );
});

test('reservation candidates and forecast counts exclude WATCH', () => {
  const watchMatches = migration.match(
    /a\.state in \('CLEAR','WATCH'\)/g,
  ) ?? [];
  assert.equal(watchMatches.length, 0);

  assert.match(
    migration,
    /create or replace function public\.read_reward_reservation_candidates_v2/u,
  );
  assert.match(
    migration,
    /create or replace function public\.read_sybil_v2_cleared_unreserved_count/u,
  );
});
