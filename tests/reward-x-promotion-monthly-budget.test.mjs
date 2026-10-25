import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const file = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const helper = file('src/lib/rewards/rewardXPromotionApiBudget.ts');
const migration = file('supabase/migrations/20261022014231_add_x_promotion_monthly_api_budget_v1.sql');
const timeline = file('src/lib/rewards/rewardXPromotionAuthorTimeline.ts');
const lookup = file('src/lib/rewards/rewardXPromotionXApi.ts');
const oauth = file('src/app/api/rewards/x-promotion/x-connect/callback/route.ts');
const cron = file('src/app/api/cron/x-promotion-maintenance/route.ts');

function scenario({ dbData = true, dbError = null } = {}) {
  const calls = [];
  const exports = {};
  const code = ts.transpileModule(helper, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, AbortSignal, console: { error() {} },
    require(id) {
      if (id === 'server-only') return {};
      if (id === 'node:crypto') return {
        createHash: () => ({
          update() { return this; },
          digest() { return 'a'.repeat(64); },
        }),
        randomUUID: () => 'test-generated-uuid',
      };
      if (id === '@/lib/supabaseServer') return { supabaseAdmin: {
        rpc(name, args) {
          assert.equal(name, 'reserve_reward_x_promotion_api_budget_v1');
          calls.push(args);
          return { abortSignal() { return { data: dbData, error: dbError }; } };
        },
      } };
      throw Error('unexpected import: ' + id);
    },
  });
  return { reserve: exports.reserveXApiReadBudget, calls };
}

test('monthly budget pessimistically reserves 10 Posts and an expanded user', async () => {
  const x = scenario();
  assert.equal(await x.reserve('TIMELINE'), true);
  assert.equal(x.calls[0].p_cost_milliusd, 60);
  assert.equal(x.calls[0].p_request_kind, 'TIMELINE');
});

test('Post verification and OAuth User reads share the same $5 allowance', async () => {
  const x = scenario();
  assert.equal(await x.reserve('POST_LOOKUP'), true);
  assert.equal(await x.reserve('OAUTH_USER'), true);
  assert.equal(x.calls[0].p_cost_milliusd, 15);
  assert.equal(x.calls[1].p_cost_milliusd, 10);
  assert.equal(x.calls.length, 2);
});

test('DB rejects over budget, malformed RPC response, or database outage; no provider calls', async () => {
  for (const config of [{dbData:false},{dbData:null},{dbError:{code:'500'}}]) {
    const x=scenario(config);
    assert.equal(await x.reserve('TIMELINE'), false);
    assert.equal(x.calls.length,1);
  }
});

test('database uses atomic row lock and immutable dollar caps', () => {
  assert.match(migration,/for update;/);
  assert.match(migration,/reserved_milliusd \+ v_expected_cost > 5000/);
  assert.match(migration,/timeline_reserved_milliusd \+ v_expected_cost > 3000/);
  assert.match(migration,/date_trunc\('month'/);
  assert.match(migration,/grant execute on function .* to service_role;/);
  assert.match(migration,/revoke all on function .* from public,anon,authenticated;/);
  assert.match(migration,/primary key \(month_utc,request_hash\)/);
});

test('all paid X Post/User app paths call budget reservation before fetch', () => {
  assert.match(timeline,/reserveXApiReadBudget\('TIMELINE'\)/);
  assert.match(lookup,/reserveXApiReadBudget\('POST_LOOKUP'\)/);
  assert.match(oauth,/reserveXApiReadBudget\('OAUTH_USER'\)/);
});

test('provider readiness re-probes early without losing the six-hour cache cap or $5 budget guard', () => {
  assert.match(
    cron,
    /EXTERNAL_READINESS_PROBE_INTERVAL_SECONDS = 5 \* 60 \* 60 \+ 30 \* 60/,
  );
  assert.match(
    cron,
    /EXTERNAL_READINESS_CACHE_MAX_AGE_SECONDS = 6 \* 60 \* 60/,
  );
  assert.match(
    cron,
    /tryClaimCronJob\([\s\S]*EXTERNAL_READINESS_PROBE_INTERVAL_SECONDS/,
  );
  assert.match(cron, /ageMs >= EXTERNAL_READINESS_CACHE_MAX_AGE_SECONDS \* 1000/);
  assert.match(lookup, /reserveXApiReadBudget\('POST_LOOKUP'\)/);
  // This probe alone stays well below the atomic $5 monthly limit.
  // Other discovery and OAuth reads share the same database-enforced ceiling.
  const maximumMonthlyProbes = Math.ceil((31 * 24 * 60) / (5 * 60 + 30));
  assert.ok(maximumMonthlyProbes * 15 < 5_000);
});
