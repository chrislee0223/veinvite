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
    /v_row\.status in \('READY','POST_NOT_FOUND'\)[\s\S]*checked_at >=/i,
  );
});

test('runtime probe verifies X endpoint without depending on Post existence or storing credentials', () => {
  assert.match(
    runtime,
    /1228393702244134912/,
  );
  assert.match(
    runtime,
    /lookupXPromotionPost/,
  );
  assert.match(runtime, /status === 'POST_NOT_FOUND'/);
  assert.doesNotMatch(
    runtime,
    /X_API_BEARER_TOKEN/,
  );
  assert.doesNotMatch(
    migration,
    /bearer|token_value|authorization/i,
  );
});

test('non-ready runtime probe pauses only through the narrow service RPC', () => {
  assert.match(runtime, /if \(!ready\)/);
  assert.match(
    runtime,
    /pause_reward_x_promotion_external_verification_v1/,
  );
  assert.doesNotMatch(
    runtime,
    /\.from\('reward_runtime_config'\)[\s\S]*\.update\(/,
  );
  assert.match(
    migration,
    /create or replace function public\.pause_reward_x_promotion_external_verification_v1\(\)[\s\S]*security definer/i,
  );
  assert.match(
    migration,
    /set reward_x_promotion_external_verification_ready=false/,
  );
  assert.doesNotMatch(
    migration.match(/create or replace function public\.pause_reward_x_promotion_external_verification_v1\(\)[\s\S]*?\$function\$;/i)?.[0] ?? '',
    /reward_x_promotion_enabled\s*=|reward_x_promotion_payout_enabled\s*=/,
  );
  assert.match(
    migration,
    /grant execute on function public\.pause_reward_x_promotion_external_verification_v1\(\)[\s\S]*to service_role/i,
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


test('external readiness bounds every Supabase wait', () => {
  assert.match(
    runtime,
    /EXTERNAL_READINESS_DB_TIMEOUT_MS\s*=\s*8_000/,
  );
  const timeoutCalls =
    runtime.match(
      /\.abortSignal\([\s\S]*?EXTERNAL_READINESS_DB_TIMEOUT_MS[\s\S]*?\)/g,
    ) ?? [];
  assert.equal(
    timeoutCalls.length,
    3,
    'insert, runtime gate read, and pause RPC must all have bounded waits',
  );
});
