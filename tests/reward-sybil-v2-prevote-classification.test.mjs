import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pipeline = await readFile('src/lib/sybil/v2/pipeline.ts','utf8');
const migration = await readFile(
  'supabase/migrations/20260929043956_harden_sybil_v2_prevote_classification.sql',
  'utf8',
);

test('known protocol/service wallets are excluded from Sybil hub inference', () => {
  for (const suffix of ['0836c602','e979c6fa','f05f6cc1','3604da89']) {
    assert.match(pipeline, new RegExp(suffix, 'u'));
  }
  assert.match(pipeline, /knownProtocolDestinations\(\)\.has\(funder\)/u);
  assert.match(migration, /sybil_v2_cluster_hub_allowlist/u);
});

test('same inviter security client is detected pre-vote and automatically restricted', () => {
  assert.match(pipeline, /security_client_wallet_observations/u);
  assert.match(pipeline, /preVoteDetection: true/u);
  assert.match(pipeline, /apply_sybil_v2_security_client_inviter_restriction/u);
  assert.match(migration, /SAME_CLIENT_RUNTIME_VERIFICATION_FAILED/u);
  assert.match(migration, /AUTO_SECURITY_CLIENT_INVITER_RESTRICTION/u);
});

test('new malicious hubs can be learned from sink-then-refunder behavior without guilt by association', () => {
  assert.match(pipeline, /HISTORICAL_SINK_RECENT_REFUNDER_CLUSTER/u);
  assert.match(pipeline, /outBlock < fundingBlock/u);
  assert.match(pipeline, /matched\.size < 3 \|\| !matched\.has\(subject\)/u);
  assert.match(migration, /v_wallets<3 or not v_subject_matches/u);
  assert.match(migration, /SINK_REFUNDER_RUNTIME_VERIFICATION_FAILED/u);
});


test('new sink-refunder enforcement preserves the legacy rapid first-VTHO loop', async () => {
  const compatibility = await readFile(
    'supabase/migrations/20260929044316_restore_funder_return_loop_compatibility.sql',
    'utf8',
  );
  assert.match(compatibility, /HISTORICAL_SINK_RECENT_REFUNDER_CLUSTER/u);
  assert.match(compatibility, /HISTORICAL_FUNDER_RETURN_LOOP_HUB/u);
  assert.match(compatibility, /o\.block_number between f\.funding_block and f\.funding_block\+12/u);
});
