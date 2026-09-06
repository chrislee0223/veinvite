import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260906084621_add_sybil_behavior_fingerprint_v1.sql',
  'utf8',
);
const observer = readFileSync(
  'src/lib/sybil/behaviorObservation.ts',
  'utf8',
);
const cron = readFileSync(
  'src/app/api/cron/reconcile/route.ts',
  'utf8',
);

test('behavior fingerprints reuse immutable impact evidence and canonical chain ordering', () => {
  assert.match(migration, /from public\.invite_impact_events e/);
  assert.match(migration, /e\.event_type = 'DAPP_REWARD'/);
  assert.match(migration, /e\.block_number,[\s\S]*coalesce\(e\.tx_index, 2147483647\),[\s\S]*coalesce\(e\.clause_index, 2147483647\),[\s\S]*e\.tx_id,[\s\S]*e\.id/);
  assert.match(migration, /where reward_order <= 3/);
  assert.match(migration, /having count\(\*\) = 3/);
});

test('an identical dApp sequence has zero standalone score', () => {
  assert.match(migration, /0::integer as sequence_only_score/);
  assert.match(migration, /Exact dApp sequence alone always has score 0/);
  assert.match(migration, /A matching dApp sequence contributes zero points/);
});

test('WATCH requires timing similarity, activation clustering, and shared funding together', () => {
  assert.match(migration, /d\.max_relative_delta <= 0\.20/);
  assert.match(migration, /d\.max_absolute_delta_seconds <= 300/);
  assert.match(migration, /p\.activation_delta_seconds <= 3600/);
  assert.match(migration, /when s\.similar_timing[\s\S]*and s\.clustered_activation[\s\S]*and s\.shared_funder[\s\S]*then 'WATCH'/);
  assert.match(migration, /shared_vtho_funder then 3 else 0/);
});

test('behavior monitoring is service-role-only and cannot mutate reward or Sybil authority', () => {
  assert.match(migration, /with \(security_invoker = true\)/);
  assert.match(migration, /revoke all on public\.operator_sybil_behavior_fingerprints[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /revoke all on public\.operator_sybil_behavior_similarity_candidates[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant select on public\.operator_sybil_behavior_similarity_candidates[\s\S]*to service_role/);
  assert.match(observer, /SYBIL_OBSERVATION_ENABLED === 'true'/);
  assert.doesNotMatch(observer, /\.insert\(/);
  assert.doesNotMatch(observer, /\.update\(/);
  assert.doesNotMatch(observer, /\.delete\(/);
  assert.doesNotMatch(observer, /sybil_status/);
  assert.doesNotMatch(observer, /reward_status/);
});

test('scheduled behavior observation is isolated from payout execution', () => {
  assert.match(cron, /'SYBIL_BEHAVIOR_OBSERVATION'/);
  assert.match(cron, /await runSybilBehaviorObservation\(\)/);
  assert.match(cron, /failedStages\.push\('SYBIL_BEHAVIOR_OBSERVATION'\)/);
  assert.match(cron, /await runAutomaticRewardPayout\(\)/);
});
