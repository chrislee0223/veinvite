import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [heartbeat, limiter, voteRoute, configText] = await Promise.all([
  read('src/lib/monitoring/cronHeartbeat.ts'),
  read('src/lib/rateLimitServer.ts'),
  read('src/app/api/cron/vote-reconcile/route.ts'),
  read('vercel.json'),
]);

test('only the non-authoritative cron START marker retries an ambiguous transient write once', () => {
  assert.match(heartbeat, /CRON_START_TRANSIENT_RETRY_DELAY_MS = 250/);
  assert.match(heartbeat, /isTransientHeartbeatStartWriteError\(error\)/);
  assert.match(heartbeat, /const payload = \{[\s\S]*?updated_at: now,[\s\S]*?\.\.\.values/);
  assert.match(
    heartbeat,
    /let \{ error \} = await write\(\);[\s\S]*?retryTransientStart &&[\s\S]*?await wait\(CRON_START_TRANSIENT_RETRY_DELAY_MS\);[\s\S]*?\(\{ error \} = await write\(\)\);/,
  );
  assert.match(
    heartbeat,
    /export async function markCronJobStarted\([\s\S]*?await upsertCronJobState\([\s\S]*?last_started_at:[\s\S]*?true,/,
  );
  assert.match(heartbeat, /export async function markCronJobSucceeded\([\s\S]*?await upsertCronJobState\(jobName, \{/);
  assert.match(heartbeat, /export async function markCronJobFailed\([\s\S]*?await upsertCronJobState\(jobName, \{/);
  assert.doesNotMatch(
    heartbeat.split('export async function tryClaimCronJob(')[1] ?? '',
    /retryTransientStart|await wait\(/,
  );
});

test('rate-limit consumption remains fail-closed and must never retry ambiguous writes', () => {
  assert.match(limiter, /if \(isJwtIssuedAtFutureError\(error\)\)/);
  assert.match(limiter, /if \(error\) \{[\s\S]*?throw new Error\(/);
  assert.match(limiter, /RATE_LIMIT_UNAVAILABLE/);
  assert.match(limiter, /status: 503/);
  assert.doesNotMatch(limiter, /TimeoutError|retryTransientStart/);
});

test('unrecovered cron start failure still returns 503 and cadence/queue schedules remain unchanged', () => {
  assert.match(
    voteRoute,
    /Vote reconcile heartbeat start failed:[\s\S]*?CRON_HEARTBEAT_START_FAILED[\s\S]*?status: 503/,
  );
  const cron = JSON.parse(configText).crons;
  assert.deepEqual(
    cron.find((row) => row.path === '/api/cron/reconcile'),
    { path: '/api/cron/reconcile', schedule: '17 0 * * *' },
  );
  assert.deepEqual(
    cron.find((row) => row.path === '/api/cron/vote-reconcile'),
    { path: '/api/cron/vote-reconcile', schedule: '* * * * *' },
  );
});
