import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261011202500_add_x_promotion_offer_readiness_v2.sql',
    import.meta.url,
  ),
  'utf8',
);

test('readiness v2 is read-only and keeps live interlock untouched', () => {
  assert.match(migration, /returns jsonb\s+language plpgsql\s+stable/i);
  assert.doesNotMatch(
    migration,
    /\b(insert into|update public|delete from|drop trigger)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /reward_x_promotion_enabled\s*=\s*true/i,
  );
  assert.doesNotMatch(
    migration,
    /reward_x_promotion_payout_enabled\s*=\s*true/i,
  );
});

test('readiness v2 prefers real shadow evidence when sufficient', () => {
  assert.match(
    migration,
    /v_shadow_ok and v_shadow_count>=v_min_samples/,
  );
  assert.match(migration, /v_evidence_mode := 'SHADOW'/);
});

test('readiness v2 allows complete historical replay as fallback evidence', () => {
  assert.match(
    migration,
    /read_reward_x_promotion_historical_replay_audit_v1/,
  );
  assert.match(
    migration,
    /v_replay_ok\s+and not v_replay_truncated\s+and v_replay_count>=v_min_samples/,
  );
  assert.match(
    migration,
    /v_evidence_mode := 'HISTORICAL_REPLAY'/,
  );
  assert.match(
    migration,
    /INSUFFICIENT_VALIDATED_SPLIT_EVIDENCE/,
  );
});

test('readiness v2 still requires shadow audit and all live paths dormant', () => {
  for (const marker of [
    'SHADOW_AUDIT_FAILED',
    'LIVE_ALREADY_ENABLED',
    'PAYOUT_ALREADY_ENABLED',
    'UNEXPECTED_LIVE_SPLITS',
    'UNEXPECTED_LIVE_OBLIGATIONS',
    'UNEXPECTED_LIVE_OPPORTUNITIES',
    'UNEXPECTED_PAYOUT_ARTIFACTS',
    'CORE_REWARD_ROUND_ACTIVE',
  ]) {
    assert.match(migration, new RegExp(marker));
  }
});

test('readiness v2 exposes evidence provenance', () => {
  for (const marker of [
    'evidenceMode',
    'evidenceSamples',
    'shadowSamples',
    'historicalReplaySamples',
    'historicalReplayOk',
    'historicalReplayTruncated',
  ]) {
    assert.match(migration, new RegExp(marker));
  }
});

test('readiness v2 stays server-only', () => {
  assert.match(
    migration,
    /revoke all on function public\.read_reward_x_promotion_offer_readiness_v2\(text,integer\)[\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.read_reward_x_promotion_offer_readiness_v2\(text,integer\)[\s\S]*to service_role/,
  );
});
