import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261012165000_add_x_promotion_external_runtime_readiness_v1.sql',
    import.meta.url,
  ),
  'utf8',
);
const runtime = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionExternalReadiness.ts',
    import.meta.url,
  ),
  'utf8',
);
const cron = await readFile(
  new URL(
    '../src/app/api/cron/x-promotion-maintenance/route.ts',
    import.meta.url,
  ),
  'utf8',
);

test('external runtime checks are immutable and server-only', () => {
  assert.match(
    migration,
    /create table if not exists public\.reward_x_promotion_external_runtime_checks/i,
  );
  assert.match(
    migration,
    /before update or delete on public\.reward_x_promotion_external_runtime_checks/i,
  );
  assert.match(
    migration,
    /alter table public\.reward_x_promotion_external_runtime_checks enable row level security/i,
  );
  assert.match(
    migration,
    /grant select,insert on table public\.reward_x_promotion_external_runtime_checks[\s\S]*to service_role/i,
  );
});

test('external verification activation requires a fresh READY runtime probe', () => {
  assert.match(
    migration,
    /read_reward_x_promotion_external_runtime_readiness_v1[\s\S]*1200/i,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_EXTERNAL_RUNTIME_NOT_READY/,
  );
  assert.match(
    migration,
    /v_row\.status='READY'[\s\S]*checked_at >=/i,
  );
});

test('runtime probe uses X official documented lookup sample and never stores credentials', () => {
  assert.match(
    runtime,
    /1228393702244134912/,
  );
  assert.match(
    runtime,
    /lookupXPromotionPost/,
  );
  assert.doesNotMatch(
    runtime,
    /X_API_BEARER_TOKEN/,
  );
  assert.doesNotMatch(
    migration,
    /bearer|token_value|authorization/i,
  );
});

test('non-ready runtime probe pauses only the external offer gate', () => {
  assert.match(
    runtime,
    /status !== 'READY'/,
  );
  assert.match(
    runtime,
    /reward_x_promotion_external_verification_ready:[\s\S]*false/,
  );
  assert.doesNotMatch(
    runtime,
    /reward_x_promotion_enabled:[\s\S]*false/,
  );
  assert.doesNotMatch(
    runtime,
    /reward_x_promotion_payout_enabled:[\s\S]*false/,
  );
});

test('maintenance performs external readiness before lifecycle and payout work', () => {
  assert.match(
    cron,
    /const externalReadiness =[\s\S]*await runExternalReadinessJob\(\)[\s\S]*const lifecycle =[\s\S]*await runLifecycleJob\(\)[\s\S]*const payout =[\s\S]*await runPayoutJob\(\)/,
  );
  assert.match(
    cron,
    /status:[\s\S]*externalReadiness\.ok[\s\S]*lifecycle\.ok/,
  );
});
