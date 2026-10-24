import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const route = readFileSync(new URL(
  '../src/app/api/cron/x-promotion-maintenance/route.ts',
  import.meta.url,
), 'utf8');
const js = ts.transpileModule(route, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function harness({
  elapsedMinutes = 329,
  providerAgeMinutes = elapsedMinutes,
  probeStatus = 'READY',
  forceClaim = null,
  signerReady = true,
} = {}) {
  const now = Date.parse('2026-10-25T00:00:00.000Z');
  const cacheInserts = [];
  const claims = [];
  let actualProbes = 0;
  let payouts = 0;
  let lifecycles = 0;
  const providerCheckedAt = new Date(
    now - providerAgeMinutes * 60_000,
  ).toISOString();
  const previous = {
    status: probeStatus,
    probe_post_id: '1228393702244134912',
    checked_at: new Date(now - 15 * 60_000).toISOString(),
    details: { cached: true, providerCheckedAt },
  };
  class ClockDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() { return now; }
  }
  const tables = {
    from(tableName) {
      assert.equal(tableName, 'reward_x_promotion_external_runtime_checks');
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: previous, error: null }),
              }),
            }),
          }),
        }),
        insert: async (row) => {
          cacheInserts.push(row);
          return { error: null };
        },
      };
    },
  };
  const mocks = {
    'node:crypto': { timingSafeEqual },
    'next/server': {
      NextResponse: {
        json: (body, options = {}) => ({
          body,
          status: options.status ?? 200,
        }),
      },
    },
    '@/lib/monitoring/cronHeartbeat': {
      tryClaimCronJob: async (name, minSuccessSeconds, leaseSeconds) => {
        claims.push({ name, minSuccessSeconds, leaseSeconds });
        if (name !== 'x-promotion-external-readiness') return false;
        return forceClaim === null
          ? elapsedMinutes * 60 >= minSuccessSeconds
          : forceClaim;
      },
      markCronJobStarted: async () => {},
      markCronJobSucceeded: async () => {},
      markCronJobFailed: async () => {},
    },
    '@/lib/rewards/rewardXPromotionExternalReadiness': {
      runRewardXPromotionExternalReadinessCheck: async () => {
        actualProbes++;
        return { network: 'mainnet', ready: true, status: 'READY' };
      },
    },
    '@/lib/vebetter/network': {
      getVeBetterNetworkConfig: () => ({ network: 'mainnet' }),
    },
    '@/lib/supabaseServer': { supabaseAdmin: tables },
    '@/lib/rewards/rewardXPromotionPayoutRuntime': {
      readRewardXPromotionPayoutRuntimeReadiness: () => ({
        ready: signerReady,
      }),
    },
    '@/lib/rewards/rewardXPromotionLifecycle': {
      runRewardXPromotionLifecycleMaintenance: async () => {
        lifecycles++;
        throw new Error('Lifecycle unexpectedly executed.');
      },
    },
    '@/lib/rewards/rewardXPromotionPayoutExecutor': {
      runRewardXPromotionPayout: async () => {
        payouts++;
        throw new Error('Payout unexpectedly executed.');
      },
    },
  };
  const module = { exports: {} };
  runInNewContext(js, {
    module,
    exports: module.exports,
    require: (name) => {
      assert.ok(name in mocks, `Unexpected module: ${name}`);
      return mocks[name];
    },
    Buffer,
    Date: ClockDate,
    console,
    process: { env: { CRON_SECRET: 'test-secret' } },
  });
  return {
    execute: () => module.exports.GET({
      headers: { get: (name) =>
        name === 'authorization' ? 'Bearer test-secret' : null },
    }),
    claims,
    cacheInserts,
    get actualProbes() { return actualProbes; },
    get payouts() { return payouts; },
    get lifecycles() { return lifecycles; },
    providerCheckedAt,
  };
}

test('readiness cache and provider probe have distinct 6h and 5h30 limits', async () => {
  const h = harness({ elapsedMinutes: 329 });
  const result = await h.execute();
  assert.equal(result.status, 200);
  assert.equal(result.body.jobs.externalReadiness.reason, 'CACHED_PROVIDER_READINESS');
  assert.equal(h.actualProbes, 0);
  assert.equal(h.cacheInserts.length, 1);
  assert.equal(h.cacheInserts[0].details.providerCheckedAt, h.providerCheckedAt);
  assert.equal(
    h.cacheInserts[0].details.reason,
    'SCHEDULED_PROBE_COOLDOWN_CACHE',
    'Scheduled cache reuse is not an actual provider HTTP 429 error.',
  );
  assert.equal(
    h.claims.find((c) => c.name === 'x-promotion-external-readiness')?.minSuccessSeconds,
    5 * 60 * 60 + 30 * 60,
  );
  assert.equal(h.payouts, 0);
  assert.equal(h.lifecycles, 0);
});

test('probe runs before cache expiry even when the 15m cron misses the exact threshold', async () => {
  const h = harness({ elapsedMinutes: 345, providerAgeMinutes: 345 });
  const result = await h.execute();
  assert.equal(result.status, 200);
  assert.equal(result.body.jobs.externalReadiness.skipped, false);
  assert.equal(h.actualProbes, 1);
  assert.equal(h.cacheInserts.length, 0);
  assert.equal(h.payouts, 0);
});

test('expired provider evidence cannot be re-stamped by a skipped or concurrent probe', async () => {
  const h = harness({
    elapsedMinutes: 361,
    providerAgeMinutes: 361,
    forceClaim: false,
  });
  const result = await h.execute();
  assert.equal(result.body.jobs.externalReadiness.reason, 'NOT_DUE_OR_ALREADY_RUNNING');
  assert.equal(h.actualProbes, 0);
  assert.equal(h.cacheInserts.length, 0);
});

test('a non-ready latest check or signer cannot be turned into READY by the cache', async () => {
  for (const input of [
    { probeStatus: 'X_API_RATE_LIMITED' },
    { probeStatus: 'X_API_AUTH_FAILED' },
    { probeStatus: 'NO_CHECK' },
    { signerReady: false },
  ]) {
    const h = harness({ elapsedMinutes: 20, providerAgeMinutes: 20, ...input });
    const result = await h.execute();
    assert.equal(result.body.jobs.externalReadiness.reason, 'NOT_DUE_OR_ALREADY_RUNNING');
    assert.equal(h.cacheInserts.length, 0);
  }
});
