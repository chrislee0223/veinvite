import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cluster = await readFile(
  'src/lib/sybil/v2/clusterMath.ts',
  'utf8',
);
const pipeline = await readFile(
  'src/lib/sybil/v2/pipeline.ts',
  'utf8',
);
const policy = await readFile(
  'src/lib/sybil/v2/policy.ts',
  'utf8',
);
const migration = await readFile(
  'supabase/migrations/20260928211500_add_behavior_pattern_restriction.sql',
  'utf8',
);

test('dense B3TR burst is detected as behavior evidence', () => {
  assert.match(cluster, /HISTORICAL_DENSE_B3TR_BURST/u);
  assert.match(cluster, /denseBurstMinimumWallets = 6/u);
  assert.match(cluster, /denseBurstBlockWindow = 180/u);
  assert.match(cluster, /denseBurstMaximumGapBlocks = 24/u);
  assert.match(cluster, /burstWallets\.has\(wallet\)/u);
});

test('automatic behavior restriction requires corroboration', () => {
  assert.match(migration, /v_sync/u);
  assert.match(migration, /v_mission and v_funding/u);
  assert.match(migration, /v_identity/u);
  assert.match(migration, /v_restricted_peers >= 3/u);
  assert.match(migration, /INSUFFICIENT_INDEPENDENT_CORROBORATION/u);
});

test('runtime re-verifies burst and protects irreversible rewards', () => {
  assert.match(migration, /v_wallet_count < 6/u);
  assert.match(migration, /v_max_gap > 24/u);
  assert.match(migration, /v_end_block - v_start_block > 180/u);
  assert.match(migration, /v_invitation\.reward_status = 'PAID'/u);
  assert.match(migration, /q\.status = 'ASSIGNED'/u);
  assert.match(migration, /sybil_v2_cluster_hub_allowlist/u);
  assert.match(migration, /v_assessment\.source <> 'SYSTEM'/u);
});

test('pipeline applies behavior restriction only after normal HOLD decision', () => {
  const policyIndex = pipeline.indexOf('const policy = evaluateSybilV2Policy');
  const recordIndex = pipeline.indexOf('const recorded = await recordAssessment');
  const behaviorIndex = pipeline.indexOf('await applyBehaviorPatternRestriction');

  assert.ok(policyIndex >= 0);
  assert.ok(recordIndex > policyIndex);
  assert.ok(behaviorIndex > recordIndex);
  assert.match(pipeline, /policy\.state === 'HOLD'[\s\S]*findBehaviorPatternHub/u);
  assert.match(pipeline, /AUTO_BEHAVIOR_PATTERN_RESTRICTION/u);
});

test('policy version advances for generalized behavior enforcement', () => {
  assert.match(policy, /SYBIL_V2_POLICY_VERSION = 'sybil-v2\.10'/u);
});
