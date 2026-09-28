import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  'supabase/migrations/20260928184500_add_confirmed_sybil_cluster_auto_blacklist.sql',
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
    migration,
    /create table if not exists public\.sybil_v2_confirmed_cluster_hubs/u,
  );
  assert.match(
    migration,
    /alter table public\.sybil_v2_confirmed_cluster_hubs\s+enable row level security/u,
  );
  assert.match(
    migration,
    /revoke all on public\.sybil_v2_confirmed_cluster_hubs\s+from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /grant select, insert, update on public\.sybil_v2_confirmed_cluster_hubs\s+to service_role/u,
  );
  assert.match(
    migration,
    /A hub alone never causes a restriction/u,
  );
});

test('operator BLACKLIST learns only the exact synchronized reward/common sink/inviter signature', () => {
  assert.match(
    migration,
    /new\.source <> 'OPERATOR'/u,
  );
  assert.match(
    migration,
    /OPERATOR_BLACKLIST/u,
  );
  assert.match(
    migration,
    /HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER/u,
  );
  assert.match(
    migration,
    /HISTORICAL_COMMON_B3TR_SINK/u,
  );
  assert.match(
    migration,
    /HISTORICAL_SINK_REAPPEARS_AS_INVITER/u,
  );
  assert.match(
    migration,
    /having count\(distinct e\.signal_code\) = 2/u,
  );
  assert.match(
    migration,
    /sybil_v2_cluster_hub_allowlist/u,
  );
});

test('automatic cluster blacklist is prospective and restricted to current SYSTEM HOLDs', () => {
  assert.match(
    migration,
    /v_assessment\.state <> 'HOLD'[\s\S]*v_assessment\.source <> 'SYSTEM'/u,
  );
  assert.match(
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
    /AUTO_CONFIRMED_CLUSTER_BLACKLIST/u,
  );
  assert.match(
    migration,
    /'SYSTEM',[\s\S]*v_assessment\.revision/u,
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
    /CONFIRMED_CLUSTER_LINK_CODES/u,
  );
  assert.match(
    pipeline,
    /activatedAt >= confirmedAt/u,
  );
});

test('Sybil policy version advances for prospective confirmed-cluster enforcement', () => {
  assert.match(
    policy,
    /SYBIL_V2_POLICY_VERSION = 'sybil-v2\\.10'/u,
  );
});
