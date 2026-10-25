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

const policyContext = { module: { exports: {} }, console };
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
  let held = { openHolds: 0, incompleteCoreHolds: 0, stalledOver1h: 0, stalledOver24h: 0 };
  let scanFailures = { failedScans: 0, failedOver1h: 0, failedOver24h: 0 };
  let xPromotion = {
    liveEnabled: true,
    payoutEnabled: true,
    externalVerificationReady: true,
    runtimeReady: true,
  };
  let xProbeStatus = 'READY';
  let xProbeCheckedAt = new Date(now).toISOString();
  let xPipeline = {
    pendingPostStalled: false,
    finalCheckStalled: false,
    payoutStalled: false,
  };
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
              : {
                  data: {
                    emergency_rewards_paused: paused,
                    mainnet_funded_rewards_enabled: true,
                    reward_x_promotion_enabled: xPromotion.liveEnabled,
                    reward_x_promotion_payout_enabled: xPromotion.payoutEnabled,
                    reward_x_promotion_external_verification_ready:
                      xPromotion.externalVerificationReady,
                  },
                  error: null,
                },
          }),
        }) }),
      };

      if (
        table === 'reward_x_promotion_post_submissions' ||
        table === 'reward_x_promotion_post_verifications'
      ) {
        const filters = {};
        const q = {
          eq(column, value) { filters[column] = value; return this; },
          in(column, values) { filters[column] = values; return this; },
          is(column, value) { filters[column] = value; return this; },
          lt(column, value) { filters['lt:' + column] = value; return this; },
          limit(value) { assert.equal(value, 1); return this; },
          abortSignal: async () => {
            const code = table === 'reward_x_promotion_post_submissions'
              ? 'pendingPostStalled'
              : filters.verification_state === 'FINAL_VERIFIED'
                ? 'payoutStalled'
                : 'finalCheckStalled';
            assert.equal(filters.network, 'mainnet');
            assert.equal(filters['reward_x_promotion_obligations.financial_state'], 'HELD');
            return dbError
              ? { error: { message: 'database unavailable' }, data: null }
              : { error: null, data: xPipeline[code] ? [{ id: 1 }] : [] };
          },
        };
        return { select: () => q };
      }
      throw Error('Unexpected table ' + table);
    },
    rpc(name, args) {
      if (name === 'read_reward_x_promotion_external_runtime_readiness_v1') {
        assert.equal(args.p_network, 'mainnet');
        assert.equal(args.p_max_age_seconds, 1200);
        return wrap(() => ({
          data: {
            ready: xPromotion.runtimeReady,
            status: xProbeStatus,
            checkedAt: xProbeCheckedAt,
          },
          error: null,
        }));
      }
      if (name === 'read_sybil_v2_failed_scan_liveness') {
        assert.equal(args.p_network, 'mainnet');
        return wrap(() => ({ data: [{
          failed_scans: scanFailures.failedScans,
          failed_over_1h: scanFailures.failedOver1h,
          failed_over_24h: scanFailures.failedOver24h,
        }], error: null }));
      }
      if (name === 'read_sybil_v2_early_hold_liveness') {
        assert.equal(args.p_network, 'mainnet');
        return wrap(() => ({ data: [{
          open_holds: held.openHolds,
          incomplete_core_holds: held.incompleteCoreHolds,
          stalled_over_1h: held.stalledOver1h,
          stalled_over_24h: held.stalledOver24h,
        }], error: null }));
      }
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
    setHolds: (counts) => { held = counts; },
    setScanFailures: (counts) => { scanFailures = counts; },
    setXPromotion: (state) => { xPromotion = { ...xPromotion, ...state }; },
    setXProbe: (status, checkedAt = new Date().toISOString()) => {
      xProbeStatus = status;
      xProbeCheckedAt = checkedAt;
    },
    setXPipeline: (state) => { xPipeline = { ...xPipeline, ...state }; },
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
  assert.equal(typeof h.getState().last_succeeded_at, 'string');
  assert.equal(typeof h.getState().last_failed_at, 'string');
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

test('Sybil HOLD alarms are transition-suppressed and only 24-hour stall is an outage', async () => {
  const h = harness();
  h.setHolds({ openHolds: 1, incompleteCoreHolds: 1, stalledOver1h: 1, stalledOver24h: 0 });
  const warning = await h.GET(h.request);
  assert.equal(warning.status, 200);
  assert.equal(warning.body.ok, true);
  assert.equal(warning.body.newAlerts, 1);
  assert.equal(warning.body.activeAlerts.includes('SYBIL_EARLY_HOLD_STALLED:1H'), true);
  assert.equal(typeof h.getState().last_succeeded_at, 'string');
  assert.equal(h.getState().last_failed_at, undefined);
  assert.equal(h.getState().last_error, 'WATCH_V1:SYBIL_EARLY_HOLD_STALLED:1H');
  assert.equal((await h.GET(h.request)).body.newAlerts, 0);
  assert.equal(typeof h.getState().last_succeeded_at, 'string');
  h.setHolds({ openHolds: 1, incompleteCoreHolds: 1, stalledOver1h: 1, stalledOver24h: 1 });
  const overdue = await h.GET(h.request);
  assert.equal(overdue.status, 503);
  assert.equal(overdue.body.newAlerts, 1);
  assert.equal(overdue.body.recoveredAlerts, 1);
  assert.equal(typeof h.getState().last_succeeded_at, 'string');
  assert.equal(typeof h.getState().last_failed_at, 'string');
  h.setHolds({ openHolds: 0, incompleteCoreHolds: 0, stalledOver1h: 0, stalledOver24h: 0 });
  assert.equal((await h.GET(h.request)).body.recoveredAlerts, 1);
});

test('X promotion cron stalls and gate/runtime divergence are observed with safe severity', async () => {
  const stale = harness();
  stale.setStale('x-promotion-lifecycle', 46);
  const staleLifecycle = await stale.GET(stale.request);
  assert.equal(staleLifecycle.status, 503);
  assert.equal(
    staleLifecycle.body.activeAlerts.includes(
      'CRON_STALE:x-promotion-lifecycle',
    ),
    true,
  );

  const warning = harness();
  warning.setXPromotion({
    externalVerificationReady: false,
    runtimeReady: true,
  });
  const closedGate = await warning.GET(warning.request);
  assert.equal(closedGate.status, 200);
  assert.equal(closedGate.body.ok, true);
  assert.equal(
    closedGate.body.activeAlerts.includes(
      'X_PROMOTION_GATE_OFF_WHILE_RUNTIME_READY',
    ),
    true,
  );
  assert.equal(warning.getState().last_failed_at, undefined);

  const critical = harness();
  critical.setXPromotion({
    externalVerificationReady: true,
    runtimeReady: false,
  });
  const unsafeGate = await critical.GET(critical.request);
  assert.equal(unsafeGate.status, 503);
  assert.equal(
    unsafeGate.body.activeAlerts.includes(
      'X_PROMOTION_GATE_ON_WHILE_RUNTIME_NOT_READY',
    ),
    true,
  );
  assert.equal(typeof critical.getState().last_failed_at, 'string');

  const inactive = harness();
  inactive.setXPromotion({
    payoutEnabled: false,
    externalVerificationReady: false,
    runtimeReady: true,
  });
  const intentionallyInactive = await inactive.GET(inactive.request);
  assert.equal(intentionallyInactive.status, 200);
  assert.deepEqual(
    Array.from(intentionallyInactive.body.activeAlerts),
    [],
  );
});

test('X runtime alert identifies expired evidence vs actual provider failures without muting outages', async () => {
  const expired = harness();
  expired.setXPromotion({ runtimeReady: false });
  expired.setXProbe('READY', new Date(Date.now() - 21 * 60_000).toISOString());
  const expiry = await expired.GET(expired.request);
  assert.equal(expiry.status, 503);
  assert.equal(expiry.body.xPromotion.runtimeProbeState, 'EXPIRED');
  assert.equal(expiry.body.xPromotion.runtimeProbeStatus, 'READY');
  assert.ok(expiry.body.xPromotion.runtimeProbeAgeSeconds >= 20 * 60);
  assert.equal(expiry.body.activeAlerts.includes('X_PROMOTION_GATE_ON_WHILE_RUNTIME_NOT_READY'), true);

  const failed = harness();
  failed.setXPromotion({ runtimeReady: false });
  failed.setXProbe('X_API_RATE_LIMITED');
  const outage = await failed.GET(failed.request);
  assert.equal(outage.status, 503);
  assert.equal(outage.body.xPromotion.runtimeProbeState, 'UNAVAILABLE');
  assert.equal(outage.body.xPromotion.runtimeProbeStatus, 'X_API_RATE_LIMITED');
  assert.equal(outage.body.activeAlerts.includes('X_PROMOTION_GATE_ON_WHILE_RUNTIME_NOT_READY'), true);
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
  assert.equal(policy.RELIABILITY_JOBS.find((j) => j.name === 'x-promotion-lifecycle').maxAgeMinutes, 45);
  assert.equal(policy.RELIABILITY_JOBS.find((j) => j.name === 'x-promotion-payout').maxAgeMinutes, 45);
  assert.deepEqual(
    Array.from(policy.xPromotionGateCodes({
      liveEnabled: true,
      payoutEnabled: true,
      externalVerificationReady: false,
      runtimeReady: true,
    })),
    ['X_PROMOTION_GATE_OFF_WHILE_RUNTIME_READY'],
  );
  assert.deepEqual(Array.from(policy.delayedRewardCode(0)), []);
  assert.deepEqual(Array.from(policy.delayedRewardCode(5)), ['REWARD_RESERVATION_DELAY:5+']);
});

test('scan failures alert separately from HOLD: fresh retries do not reset 24h outage', async () => {
  const h = harness();
  h.setScanFailures({ failedScans: 1, failedOver1h: 0, failedOver24h: 0 });
  const fresh = await h.GET(h.request);
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.activeAlerts.length, 0);

  h.setScanFailures({ failedScans: 1, failedOver1h: 1, failedOver24h: 0 });
  const warning = await h.GET(h.request);
  assert.equal(warning.status, 200);
  assert.equal(warning.body.newAlerts, 1);
  assert.equal(warning.body.activeAlerts.includes('SYBIL_SCAN_FAILED:1H'), true);
  assert.equal(warning.body.sybilScanFailures.failedScans, 1);
  assert.equal(h.getState().last_failed_at, undefined);

  h.setScanFailures({ failedScans: 1, failedOver1h: 1, failedOver24h: 1 });
  const critical = await h.GET(h.request);
  assert.equal(critical.status, 503);
  assert.equal(critical.body.activeAlerts.includes('SYBIL_SCAN_FAILED:24H'), true);
  assert.equal(critical.body.recoveredAlerts, 1);
  assert.equal(typeof h.getState().last_failed_at, 'string');

  h.setScanFailures({ failedScans: 0, failedOver1h: 0, failedOver24h: 0 });
  const recovered = await h.GET(h.request);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.recoveredAlerts, 1);
  // Both the 1h->24h transition and final recovery publish a resolution.
  assert.equal(h.infos.length, 2);
});

test('failed scan liveness query refuses malformed aggregate and fails closed', async () => {
  const h = harness();
  h.setScanFailures({ failedScans: 1, failedOver1h: 2, failedOver24h: 0 });
  const invalid = await h.GET(h.request);
  assert.equal(invalid.status, 503);
  assert.equal(invalid.body.error, 'CRON_HEALTH_DB_UNAVAILABLE');
  assert.equal(h.getState(), null);
});

test('X bonus stuck states are read-only, wallet-private and non-outage alerts', async () => {
  const h = harness();
  h.setXPipeline({
    pendingPostStalled: true,
    finalCheckStalled: true,
    payoutStalled: true,
  });
  const first = await h.GET(h.request);
  assert.equal(first.status, 200);
  assert.equal(first.body.newAlerts, 3);
  assert.deepEqual(Array.from(first.body.activeAlerts), [
    'X_PROMOTION_FINAL_CHECK_STALLED',
    'X_PROMOTION_PAYOUT_STALLED',
    'X_PROMOTION_POST_VERIFICATION_STALLED',
  ]);
  assert.equal(first.body.xPromotionPipeline.pendingPostStalled, true);
  assert.equal(h.errors.length, 1);
  assert.equal((await h.GET(h.request)).body.newAlerts, 0);

  // Closing the payout gate intentionally removes the anomaly warnings.
  h.setXPromotion({ payoutEnabled: false });
  assert.equal((await h.GET(h.request)).body.activeAlerts.length, 0);
  h.setXPromotion({ payoutEnabled: true });
  h.setXPipeline({
    pendingPostStalled: false,
    finalCheckStalled: false,
    payoutStalled: false,
  });
  assert.equal((await h.GET(h.request)).body.activeAlerts.length, 0);
});

test('X bonus pipeline query failures fail closed without touching rewards', async () => {
  const h = harness();
  h.setDbError(true);
  const res = await h.GET(h.request);
  assert.equal(res.status, 503);
  assert.equal(res.body.error, 'CRON_HEALTH_DB_UNAVAILABLE');
  assert.doesNotMatch(routeSource, /create_reward_x_promotion_payout_intent_v1/);
  assert.doesNotMatch(routeSource, /record_reward_x_promotion_post_submission_v1/);
  assert.match(routeSource, /\.limit\(1\)/);
});
