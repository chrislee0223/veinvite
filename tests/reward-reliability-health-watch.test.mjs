import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const policySource = readFileSync(new URL(
  '../src/lib/monitoring/reliabilityWatchPolicy.ts', import.meta.url,
), 'utf8');
const routeSource = readFileSync(new URL(
  '../src/app/api/cron/reliability-health/route.ts', import.meta.url,
), 'utf8');
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const js = (content) => ts.transpileModule(content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const policyContext = { module: { exports: {} }, require, console };
policyContext.exports = policyContext.module.exports;
runInNewContext(js(policySource), policyContext);
const policy = policyContext.module.exports;

function harness() {
  const now = Date.now();
  let rows = policy.RELIABILITY_JOBS.map(({ name }) => ({
    job_name: name, last_succeeded_at: new Date(now).toISOString(),
  }));
  let savedState = null;
  let delayed = 0;
  let paused = false;
  let dbError = false;
  const errors = [];
  const infos = [];
  const wrap = (value) => ({ abortSignal: async () => {
    if (dbError) return { error: { message: 'database unavailable' }, data: null };
    return typeof value === 'function' ? value() : value;
  } });
  const supabaseAdmin = {
    from(table) {
      if (table === 'cron_job_states') return {
        select: () => ({
          in: () => wrap(() => ({
            data: [...rows, ...(savedState ? [savedState] : [])],
            error: null,
          })),
        }),
        upsert: (state) => wrap(() => {
          savedState = { ...(savedState ?? {}), ...state };
          return { error: null };
        }),
      };
      if (table === 'reward_runtime_config') return {
        select: () => ({ eq: () => ({
          abortSignal: () => ({
            maybeSingle: async () => dbError
              ? { data: null, error: { message: 'database unavailable' } }
              : { data: { emergency_rewards_paused: paused, mainnet_funded_rewards_enabled: true }, error: null },
          }),
        }) }),
      };
      throw Error('Unexpected table ' + table);
    },
    rpc(name, args) {
      assert.equal(name, 'read_stale_reward_reservation_liveness');
      assert.equal(args.p_stale_minutes, 15);
      return wrap(() => ({ data: [{ missing_count: delayed }], error: null }));
    },
  };
  const mocks = {
    'node:crypto': { timingSafeEqual },
    'next/server': { NextResponse: { json: (body, opts) => ({
      status: opts.status ?? 200, body,
    }) } },
    '@/lib/monitoring/reliabilityWatchPolicy': policy,
    '@/lib/supabaseServer': { supabaseAdmin },
    '@/lib/vebetter/network': { getVeBetterNetworkConfig: () => ({ network: 'mainnet' }) },
  };
  const context = {
    module: { exports: {} },
    require: (name) => {
      assert.ok(name in mocks, 'Unexpected import ' + name);
      return mocks[name];
    },
    process: { env: { CRON_SECRET: 'test-secret' } },
    Buffer, Date, Number, Array, Map, Set, console: {
      error: (...args) => errors.push(args),
      info: (...args) => infos.push(args),
    }, AbortSignal,
  };
  context.exports = context.module.exports;
  runInNewContext(js(routeSource), context);
  return {
    GET: context.module.exports.GET,
    request: { headers: { get: (name) =>
      name === 'authorization' ? 'Bearer test-secret' : null,
    } },
    setStale(name, minutes) {
      rows = rows.map((row) => row.job_name === name
        ? { ...row, last_succeeded_at: new Date(Date.now() - minutes * 60_000).toISOString() }
        : row);
    },
    setFresh(name) {
      rows = rows.map((row) => row.job_name === name
        ? { ...row, last_succeeded_at: new Date().toISOString() }
        : row);
    },
    setDelayed: (count) => { delayed = count; },
    setPaused: (value) => { paused = value; },
    setDbError: (value) => { dbError = value; },
    errors, infos,
    getState: () => savedState,
  };
}

test('independent read-only watchdog runs every 15 minutes with no payout or verification calls', () => {
  assert.deepEqual(config.crons.find((job) =>
    job.path === '/api/cron/reliability-health'),
  { path: '/api/cron/reliability-health', schedule: '7,22,37,52 * * * *' });
  assert.doesNotMatch(routeSource, /runAutomaticRewardPayout|reserveEligibleReferralRewards|syncInvitationEvidence/);
  assert.match(routeSource, /read_stale_reward_reservation_liveness/);
  assert.match(routeSource, /cron_job_states/);
  assert.match(routeSource, /AbortSignal\.timeout\(HEALTH_READ_TIMEOUT_MS\)/);
});

test('one failed minute is not an alert, thirty-minute outage is, repeated alerts are suppressed', async () => {
  const h = harness();
  h.setStale('vote-reconcile', 12);
  assert.equal((await h.GET(h.request)).status, 200);
  assert.equal(h.errors.length, 0);
  h.setStale('vote-reconcile', 31);
  const first = await h.GET(h.request);
  assert.equal(first.status, 503);
  assert.equal(first.body.newAlerts, 1);
  assert.equal(h.errors.length, 1);
  assert.equal((await h.GET(h.request)).body.newAlerts, 0);
  assert.equal(h.errors.length, 1);
  h.setFresh('vote-reconcile');
  const resolved = await h.GET(h.request);
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.recoveredAlerts, 1);
  assert.equal(h.infos.length, 1);
  assert.equal((await h.GET(h.request)).body.recoveredAlerts, 0);
  assert.equal(h.infos.length, 1);
});

test('reward reservation backlog is observed but not executed; severity bands signal worsening', async () => {
  const h = harness();
  h.setDelayed(1);
  assert.equal((await h.GET(h.request)).body.activeAlerts.includes('REWARD_RESERVATION_DELAY:1'), true);
  h.setDelayed(3);
  const worse = await h.GET(h.request);
  assert.equal(worse.body.newAlerts, 1);
  assert.equal(worse.body.recoveredAlerts, 1);
  h.setPaused(true);
  const paused = await h.GET(h.request);
  assert.equal(paused.status, 200);
  assert.equal(paused.body.delayedRewards, 0);
  assert.equal(h.errors.length, 2);
});

test('watchdog fails closed on DB errors and does not expose data to unauthenticated callers', async () => {
  const h = harness();
  assert.equal((await h.GET({ headers: { get: () => 'Bearer wrong' } })).status, 401);
  h.setDbError(true);
  assert.equal((await h.GET(h.request)).status, 503);
  assert.equal(h.errors.length, 1);
  assert.equal(h.getState(), null);
});

test('alert policy retains precise thresholds for frequent and daily jobs', () => {
  assert.equal(policy.RELIABILITY_JOBS.find((j) => j.name === 'vote-reconcile').maxAgeMinutes, 30);
  assert.equal(policy.RELIABILITY_JOBS.find((j) => j.name === 'daily-reconcile').maxAgeMinutes, 1800);
  assert.deepEqual(Array.from(policy.delayedRewardCode(0)), []);
  assert.deepEqual(Array.from(policy.delayedRewardCode(5)), ['REWARD_RESERVATION_DELAY:5+']);
});
