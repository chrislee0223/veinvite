import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  'supabase/migrations/20260928211500_add_behavior_pattern_auto_blacklist.sql',
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

test('novel behavior auto-black requires the full coordinated burst signature', () => {
  assert.match(
    migration,
    /HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER/u,
  );
  assert.match(
    migration,
    /HISTORICAL_TIGHT_B3TR_CONSOLIDATION_BURST/u,
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
    /burstWalletCount'[\s\S]*::integer >= 8/u,
  );
  assert.match(
    migration,
    /burstWindowSeconds'[\s\S]*::integer <= 1800/u,
  );
});

test('novel behavior auto-black cannot override operator review or settled rewards', () => {
  assert.match(
    migration,
    /v_assessment\.state <> 'HOLD'[\s\S]*v_assessment\.source <> 'SYSTEM'/u,
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
    /sybil_v2_cluster_hub_allowlist/u,
  );
  assert.match(
    migration,
    /'restrictionScope', 'INVITEE_ONLY'/u,
  );
});

test('behavior pattern enforcement is service-only and records a SYSTEM restriction', () => {
  assert.match(
    migration,
    /revoke all on function public\.apply_sybil_v2_behavior_pattern_blacklist[\s\S]*from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.apply_sybil_v2_behavior_pattern_blacklist[\s\S]*to service_role/u,
  );
  assert.match(
    migration,
    /AUTO_COORDINATED_BURST_BLACKLIST/u,
  );
  assert.match(
    migration,
    /'SYSTEM',[\s\S]*v_assessment\.revision/u,
  );
});

test('runtime evaluates normal policy first and auto-blacklists only a recorded HOLD', () => {
  const policyIndex = pipeline.indexOf(
    'const policy = evaluateSybilV2Policy',
  );
  const matchIndex = pipeline.indexOf(
    'await findCoordinatedBurstHubMatch',
  );
  const recordIndex = pipeline.indexOf(
    'const recorded = await recordAssessment',
  );
  const applyIndex = pipeline.indexOf(
    'await applyCoordinatedBurstBlacklist',
  );

  assert.ok(policyIndex >= 0);
  assert.ok(matchIndex > policyIndex);
  assert.ok(recordIndex > matchIndex);
  assert.ok(applyIndex > recordIndex);

  assert.match(
    pipeline,
    /policy\.state === 'HOLD'[\s\S]*findCoordinatedBurstHubMatch/u,
  );
  assert.match(
    pipeline,
    /B3TR_BURST_MIN_WALLETS = 8/u,
  );
  assert.match(
    pipeline,
    /B3TR_BURST_WINDOW_SECONDS = 30 \* 60/u,
  );
});

test('v2.10 keeps ambiguous evidence on HOLD while separate enforcement handles overwhelming patterns', () => {
  assert.match(
    policy,
    /SYBIL_V2_POLICY_VERSION = 'sybil-v2\.10'/u,
  );
  assert.doesNotMatch(
    policy,
    /state:\s*'BLACKLIST'/u,
  );
  assert.match(
    pipeline,
    /AUTO_COORDINATED_BURST_BLACKLIST/u,
  );
});
