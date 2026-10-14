import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const reservation = read('src/lib/rewards/rewardReservation.ts');
const lock = read('src/lib/rewards/reservationSweepLock.ts');
const daily = read('src/app/api/cron/reconcile/route.ts');
const analytics = read('src/app/api/cron/analytics-maintenance/route.ts');
const dailyBackup = read('src/app/api/cron/reconcile-retry/route.ts');
const analyticsBackup = read('src/app/api/cron/analytics-maintenance-retry/route.ts');
const config = JSON.parse(read('vercel.json'));
const health = read('src/app/api/cron/reliability-health/route.ts');

test('all reservation paths serialize before reading chain state or pricing', () => {
  assert.match(reservation, /return withRewardReservationSweepLock\([\s\S]*?readFinalizedBlockNumber\(\)/);
  assert.match(lock, /try_acquire_operator_lock/);
  assert.match(lock, /p_lease_seconds: RESERVATION_SWEEP_LEASE_SECONDS/);
  assert.match(lock, /RESERVATION_SWEEP_LEASE_SECONDS = 600/);
  assert.match(lock, /if \(data !== true\)[\s\S]*?return whenBusy\(\)/);
  assert.match(lock, /try \{[\s\S]*?return await work\(\);[\s\S]*?finally/);
  assert.match(lock, /release_operator_lock/);
  assert.match(lock, /if \(error\)[\s\S]*?throw new Error/);
});

test('daily job stops heavy fan-out if the DB claim fails', () => {
  assert.match(daily, /tryClaimCronJob\(\s*'daily-reconcile',\s*12 \* 60 \* 60,\s*600/);
  assert.match(daily, /DAILY_RECONCILE_CLAIM_UNAVAILABLE/);
  assert.ok(
    daily.indexOf('DAILY_RECONCILE_CLAIM_UNAVAILABLE') <
      daily.indexOf('syncVeInviteAllocationReceipts();'),
  );
  assert.match(daily, /markCronJobFailed\(/);
  assert.match(daily, /markCronJobSucceeded\(/);
});

test('analytics recovery is claimed once and preserves non-destructive archive handling', () => {
  assert.match(analytics, /tryClaimCronJob\(\s*'analytics-maintenance',\s*12 \* 60 \* 60,\s*600/);
  assert.match(analytics, /ANALYTICS_MAINTENANCE_CLAIM_UNAVAILABLE/);
  assert.match(analytics, /finalize_long_term_analytics/);
  assert.match(analytics, /destructiveCleanupEnabled: false/);
  assert.match(analytics, /markCronJobFailed\(/);
});

test('backup entrypoints reuse the authenticated primary handlers', () => {
  assert.match(dailyBackup, /import \{ GET as runDailyReconciliation \} from '..\/reconcile\/route'/);
  assert.match(analyticsBackup, /import \{ GET as runAnalyticsMaintenance \} from '..\/analytics-maintenance\/route'/);
  const paths = config.crons.map((cron) => cron.path);
  assert.equal(new Set(paths).size, paths.length, 'duplicate cron paths');
  for (const path of [
    '/api/cron/reconcile',
    '/api/cron/reconcile-retry',
    '/api/cron/analytics-maintenance',
    '/api/cron/analytics-maintenance-retry',
  ]) assert.ok(paths.includes(path), `missing cron ${path}`);
  assert.equal(
    config.crons.find((cron) => cron.path === '/api/cron/reconcile-retry').schedule,
    '17 3 * * *',
  );
});

test('reservation retries still fail closed and retain authoritative scheduled recovery', () => {
  const queue = read('src/app/api/queues/reward-reservation/route.ts');
  assert.match(queue, /if \(hasDurableReservation\(before\)\)/);
  assert.match(queue, /if \(sweep\.pricingConflictInviteCodes\.includes\(message\.inviteCode\)\)/);
  assert.match(queue, /metadata\.deliveryCount >= 10/);
  assert.match(queue, /RESERVATION_DB_OUTAGE_BACKOFF_SECONDS = 900/);
  assert.match(reservation, /await rewardReservationRuntimeOpen\(network\)/);
  assert.match(reservation, /MAX_REPRICE_ATTEMPTS = 4/);
});

test('independent monitoring detects missing jobs without performing reward writes', () => {
  assert.match(health, /CRON_HEALTH_STALE/);
  assert.match(health, /CRON_HEALTH_DB_UNAVAILABLE/);
  assert.match(health, /MONITORED_JOBS/);
  assert.match(health, /timingSafeEqual/);
  assert.doesNotMatch(health, /reserveEligibleReferralRewards|runAutomaticRewardPayout|runSybilV2AssessmentBatch/);
  assert.deepEqual(
    config.crons.find((job) => job.path === '/api/cron/reliability-health'),
    { path: '/api/cron/reliability-health', schedule: '0 */6 * * *' },
  );
});
