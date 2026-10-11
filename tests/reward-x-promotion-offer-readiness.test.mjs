import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261011121500_add_x_promotion_offer_readiness_audit_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('offer readiness is read-only and does not replace the hard live interlock', () => {
  assert.match(migration, /returns jsonb/);
  assert.match(migration, /language plpgsql\s+stable/);
  assert.doesNotMatch(migration, /update public\.reward_runtime_config/i);
  assert.doesNotMatch(migration, /drop trigger if exists reward_x_promotion_live_activation_interlock/i);
});

test('offer readiness requires real shadow evidence', () => {
  assert.match(migration, /p_min_shadow_samples integer default 5/);
  assert.match(migration, /INSUFFICIENT_SHADOW_SAMPLES/);
  assert.match(migration, /v_shadow_count<v_min_samples/);
  assert.match(migration, /SHADOW_AUDIT_FAILED/);
});

test('offer readiness requires all live and payout paths to remain dormant', () => {
  for (const marker of [
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

test('offer readiness is server-only', () => {
  assert.match(
    migration,
    /revoke all on function public\.read_reward_x_promotion_offer_readiness_v1\(text,integer\)[\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.read_reward_x_promotion_offer_readiness_v1\(text,integer\)[\s\S]*to service_role/,
  );
});
