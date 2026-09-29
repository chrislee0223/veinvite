import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const originalMigration = await readFile(
  'supabase/migrations/20260928184500_add_confirmed_sybil_cluster_auto_blacklist.sql',
  'utf8',
);
const migration = await readFile(
  'supabase/migrations/20260929174500_add_prevote_funder_return_loop_enforcement.sql',
  'utf8',
);
const corroborationMigration = await readFile(
  'supabase/migrations/20260929193000_expand_confirmed_hub_corroboration.sql',
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

test('confirmed cluster registry is service-only and does not blacklist from hub linkage alone', () => {
  assert.match(
    originalMigration,
    /create table if not exists public\.sybil_v2_confirmed_cluster_hubs/u,
  );
  assert.match(
    originalMigration,
    /alter table public\.sybil_v2_confirmed_cluster_hubs\s+enable row level security/u,
  );
  assert.match(
    originalMigration,
    /revoke all on public\.sybil_v2_confirmed_cluster_hubs\s+from public, anon, authenticated/u,
  );
  assert.match(
    originalMigration,
    /grant select, insert, update on public\.sybil_v2_confirmed_cluster_hubs\s+to service_role/u,
  );
  assert.match(
    originalMigration,
    /A hub alone never causes a restriction/u,
  );
});

test('operator BLACKLIST learns only the exact synchronized reward/common sink/inviter signature', () => {
  assert.match(
    originalMigration,
    /new\.source <> 'OPERATOR'/u,
  );
  assert.match(
    originalMigration,
    /OPERATOR_BLACKLIST/u,
  );
  assert.match(
    originalMigration,
    /HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER/u,
  );
  assert.match(
    originalMigration,
    /HISTORICAL_COMMON_B3TR_SINK/u,
  );
  assert.match(
    originalMigration,
    /HISTORICAL_SINK_REAPPEARS_AS_INVITER/u,
  );
  assert.match(
    originalMigration,
    /having count\(distinct e\.signal_code\) = 2/u,
  );
  assert.match(
    originalMigration,
    /sybil_v2_cluster_hub_allowlist/u,
  );
});

test('confirmed cluster blacklist is retrospective only for unpaid/unassigned SYSTEM HOLDs', () => {
  assert.match(
    migration,
    /v_assessment\.state <> 'HOLD'[\s\S]*v_assessment\.source <> 'SYSTEM'/u,
  );
  assert.doesNotMatch(
    migration,
    /h\.confirmed_at <= v_invitation\.activated_at/u,
  );
  assert.match(
    migration,
    /v_invitation\.reward_status = 'PAID'/u,
  );
  assert.match(
    migration,
    /q\.status = 'ASSIGNED'/u,
  );
  assert.match(
    migration,
    /retrospectiveUnpaidEnforcement/u,
  );
  assert.match(
    migration,
    /AUTO_CONFIRMED_CLUSTER_BLACKLIST/u,
  );
});

test('confirmed malicious hub enforcement accepts only strong corroboration beyond the hub link', () => {
  assert.match(
    corroborationMigration,
    /HISTORICAL_COMMON_B3TR_SINK/u,
  );
  assert.match(
    corroborationMigration,
    /HISTORICAL_SINK_REAPPEARS_AS_INVITER/u,
  );
  assert.match(
    corroborationMigration,
    /HISTORICAL_DENSE_B3TR_BURST/u,
  );
  assert.match(
    corroborationMigration,
    /MISSION_PATTERN_CLUSTER/u,
  );
  assert.match(
    corroborationMigration,
    /CONFIRMED_CLUSTER_CORROBORATION_MISSING/u,
  );
  assert.match(
    corroborationMigration,
    /confirmedClusterCorroboration/u,
  );
  assert.match(
    corroborationMigration,
    /v_invitation\.reward_status = 'PAID'/u,
  );
  assert.match(
    corroborationMigration,
    /q\.status = 'ASSIGNED'/u,
  );
  assert.match(
    corroborationMigration,
    /sybil_v2_cluster_hub_allowlist/u,
  );
});

test('runtime keeps the normal policy at HOLD and only then invokes confirmed-cluster enforcement', () => {
  const policyIndex = pipeline.indexOf(
    'const policy = evaluateSybilV2Policy',
  );
  const matchIndex = pipeline.indexOf(
    'await findConfirmedClusterHubMatch',
  );
  const recordIndex = pipeline.indexOf(
    'const recorded = await recordAssessment',
  );
  const automaticIndex = pipeline.indexOf(
    'await applyConfirmedClusterBlacklist',
  );

  assert.ok(policyIndex >= 0);
  assert.ok(matchIndex > policyIndex);
  assert.ok(recordIndex > matchIndex);
  assert.ok(automaticIndex > recordIndex);

  assert.match(
    pipeline,
    /policy\.state === 'HOLD'[\s\S]*findConfirmedClusterHubMatch/u,
  );
  assert.match(
    pipeline,
    /HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER/u,
  );
  assert.match(
    pipeline,
    /HISTORICAL_DENSE_B3TR_BURST/u,
  );
  assert.match(
    pipeline,
    /MISSION_PATTERN_CLUSTER/u,
  );
  assert.match(
    pipeline,
    /CONFIRMED_CLUSTER_LINK_CODES/u,
  );
  assert.doesNotMatch(
    pipeline,
    /activatedAt >= confirmedAt/u,
  );
  assert.match(
    pipeline,
    /Confirmation time is knowledge time/u,
  );
});

test('Sybil policy version advances for pre-vote and retrospective enforcement', () => {
  assert.match(
    policy,
    /SYBIL_V2_POLICY_VERSION = 'sybil-v2\.13'/u,
  );
});
