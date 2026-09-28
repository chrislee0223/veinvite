import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  'supabase/migrations/20260928142456_require_independent_behavior_corroboration.sql',
  'utf8',
);

test('automatic behavior restriction requires subject-level independent corroboration', () => {
  assert.match(migration, /v_sync/u);
  assert.match(migration, /v_mission and v_funding/u);
  assert.match(migration, /v_identity/u);
  assert.match(migration, /INDEPENDENT_CORROBORATION_REQUIRED/u);
  assert.doesNotMatch(migration, /v_peers\s*>=\s*3/u);
  assert.doesNotMatch(migration, /RESTRICTED_BURST_PEERS/u);
});

test('peer-only cascade path is hidden behind the independent-evidence wrapper', () => {
  assert.match(
    migration,
    /rename to apply_sybil_v2_behavior_pattern_restriction_v1_internal/u,
  );
  assert.match(
    migration,
    /return public\.apply_sybil_v2_behavior_pattern_restriction_v1_internal/u,
  );
  assert.match(
    migration,
    /Peer restrictions alone cannot recursively trigger another automatic restriction/u,
  );
});

test('behavior restriction RPC remains service-only and security invoker', () => {
  assert.match(migration, /security invoker/u);
  assert.match(
    migration,
    /revoke all on function public\.apply_sybil_v2_behavior_pattern_restriction[\s\S]*from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.apply_sybil_v2_behavior_pattern_restriction[\s\S]*to service_role/u,
  );
});
