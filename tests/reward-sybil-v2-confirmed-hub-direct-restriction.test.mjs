import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pipeline = await readFile(
  'src/lib/sybil/v2/pipeline.ts',
  'utf8',
);
const policy = await readFile(
  'src/lib/sybil/v2/policy.ts',
  'utf8',
);
const migration = await readFile(
  'supabase/migrations/20260929183500_add_confirmed_hub_direct_restriction.sql',
  'utf8',
);

test('confirmed hub direct transfer is recorded as historical MEDIUM evidence', () => {
  assert.match(pipeline, /HISTORICAL_DIRECT_CONFIRMED_HUB_TRANSFER/u);
  assert.match(pipeline, /strength:\s*'MEDIUM'/u);
  assert.match(pipeline, /score:\s*45/u);
  assert.match(policy, /HISTORICAL_DIRECT_CONFIRMED_HUB_TRANSFER/u);
});

test('automatic restriction requires independent corroboration', () => {
  assert.match(pipeline, /hasIndependentConfirmedHubCorroboration/u);
  assert.match(pipeline, /MISSION_BEHAVIOR/u);
  assert.match(pipeline, /FUNDING/u);
  assert.match(pipeline, /SECURITY_IDENTITY/u);
  assert.match(migration, /v_mission/u);
  assert.match(migration, /v_funding/u);
  assert.match(migration, /v_identity/u);
  assert.match(migration, /INSUFFICIENT_INDEPENDENT_CORROBORATION/u);
});

test('database re-verifies active hub, historical transfer, and irreversible reward guards', () => {
  assert.match(migration, /SYNC_REWARD_COMMON_SINK_INVITER_V1/u);
  assert.match(migration, /HISTORICAL_DIRECT_CONFIRMED_HUB_TRANSFER/u);
  assert.match(migration, /sybil_v2_preactivation_b3tr_outflows/u);
  assert.match(migration, /v_invitation\.reward_status = 'PAID'/u);
  assert.match(migration, /q\.status = 'ASSIGNED'/u);
  assert.match(migration, /sybil_v2_cluster_hub_allowlist/u);
  assert.match(migration, /v_assessment\.source <> 'SYSTEM'/u);
});

test('runtime applies confirmed-hub direct restriction only after HOLD', () => {
  const policyIndex = pipeline.indexOf('const policy = evaluateSybilV2Policy');
  const recordIndex = pipeline.indexOf('const recorded = await recordAssessment');
  const directIndex = pipeline.indexOf('await applyConfirmedHubDirectRestriction');

  assert.ok(policyIndex >= 0);
  assert.ok(recordIndex > policyIndex);
  assert.ok(directIndex > recordIndex);
  assert.match(
    pipeline,
    /policy\.state === 'HOLD'[\s\S]*findConfirmedHubDirectRestrictionHub/u,
  );
  assert.match(pipeline, /AUTO_CONFIRMED_HUB_DIRECT_RESTRICTION/u);
});

test('policy version advances for confirmed-hub direct enforcement', () => {
  assert.match(policy, /SYBIL_V2_POLICY_VERSION = 'sybil-v2\.11'/u);
});
