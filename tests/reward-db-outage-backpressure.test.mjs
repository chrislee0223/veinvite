import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [queue, heartbeat, voteCron, reservation, recovery, configRaw, rateLimiter] = await Promise.all([
  read('src/app/api/queues/reward-reservation/route.ts'),
  read('src/lib/monitoring/cronHeartbeat.ts'),
  read('src/app/api/cron/vote-reconcile/route.ts'),
  read('src/lib/rewards/rewardReservation.ts'),
  read('src/lib/rewards/rewardReservationRecovery.ts'),
  read('vercel.json'),
  read('src/lib/rateLimitServer.ts'),
]);

test('queue aborts each PostgREST state read before the 300s function timeout', () => {
  assert.match(queue, /RESERVATION_QUEUE_READ_TIMEOUT_MS = 8_000/);
  assert.equal(
    (queue.match(/\.abortSignal\(AbortSignal\.timeout\(RESERVATION_QUEUE_READ_TIMEOUT_MS\)\)/g) ?? []).length,
    3,
    'both reservation/invitation state reads and clearance revision read must be bounded',
  );
  assert.match(queue, /visibilityTimeoutSeconds: 300/);
  assert.match(queue, /hasDurableReservation\(before\)/);
  assert.match(queue, /hasDurableReservation\(after\)/);
  assert.match(queue, /assessment\?\.revision/);
  assert.match(queue, /latestRevision > message\.assessmentRevision/);
});

test('database outages defer Queue redelivery while durable recovery remains authoritative', () => {
  assert.match(queue, /RESERVATION_DB_OUTAGE_BACKOFF_SECONDS = 900/);
  assert.match(queue, /could not query the database for the schema cache/i);
  assert.match(queue, /return \{ afterSeconds: RESERVATION_DB_OUTAGE_BACKOFF_SECONDS \}/);
  assert.match(queue, /metadata\.deliveryCount >= 10/);
  assert.match(queue, /return \{ acknowledge: true \}/);
  assert.match(queue, /afterSeconds: Math\.min\(\s*900/);
  assert.match(recovery, /readStaleEligibleRewardReservationLiveness/);
  assert.match(recovery, /reserveEligibleReferralRewards/);
  assert.match(reservation, /commit_reward_reservation_with_late_reserve/);
});

test('idempotent cron heartbeat has short transport budget', () => {
  assert.match(heartbeat, /CRON_HEARTBEAT_TIMEOUT_MS = 8_000/);
  assert.match(heartbeat, /\.abortSignal\(AbortSignal\.timeout\(CRON_HEARTBEAT_TIMEOUT_MS\)\)/);
  assert.match(heartbeat, /\.from\('cron_job_states'\)/);
  assert.match(heartbeat, /onConflict: 'job_name'/);
});

test('minute vote watcher fails closed instead of cascading DB lock and reward calls', () => {
  const catchStart = voteCron.indexOf('Vote reconcile heartbeat start failed:');
  const shortCircuit = voteCron.indexOf("code: 'CRON_HEARTBEAT_START_FAILED'", catchStart);
  const watcher = voteCron.indexOf('await runEventDrivenVoteWatcher()', catchStart);
  assert.ok(catchStart > -1 && shortCircuit > catchStart && watcher > shortCircuit);
  const preWatcher = voteCron.slice(catchStart, watcher);
  assert.ok(preWatcher.includes('return NextResponse.json('));
  assert.ok(preWatcher.includes('status: 503'));
  assert.match(voteCron, /await runRewardRecoveryMaintenance\(\)/);
  assert.match(voteCron, /await runEventDrivenVoteWatcher\(\)/);
  const crons = JSON.parse(configRaw).crons;
  assert.equal(crons.find((x) => x.path === '/api/cron/reconcile')?.schedule, '17 0 * * *');
  assert.equal(crons.find((x) => x.path === '/api/cron/vote-reconcile')?.schedule, '* * * * *');
});


test('cron lease claims and server-side rate limits abort unhealthy PostgREST promptly', () => {
  assert.match(heartbeat, /'try_claim_cron_job'/);
  assert.equal(
    (heartbeat.match(/\.abortSignal\(AbortSignal\.timeout\(CRON_HEARTBEAT_TIMEOUT_MS\)\)/g) ?? []).length,
    2,
    'both idempotent heartbeat and lease claim requests need the transport budget',
  );
  assert.match(rateLimiter, /RATE_LIMIT_RPC_TIMEOUT_MS = 8_000/);
  assert.match(rateLimiter, /\.abortSignal\(AbortSignal\.timeout\(RATE_LIMIT_RPC_TIMEOUT_MS\)\)/);
  assert.match(rateLimiter, /code:\s*'RATE_LIMIT_UNAVAILABLE'/);
  assert.match(rateLimiter, /status: 503/);
  assert.match(rateLimiter, /Every other failure remains non-retriable and fail-closed/);
});
