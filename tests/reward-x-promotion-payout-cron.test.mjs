import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL(
    '../src/app/api/cron/x-promotion-maintenance/route.ts',
    import.meta.url,
  ),
  'utf8',
);

const vercel = JSON.parse(
  await readFile(
    new URL('../vercel.json', import.meta.url),
    'utf8',
  ),
);

test('lifecycle and payout use independent heartbeat job names', () => {
  assert.match(route, /x-promotion-lifecycle/);
  assert.match(route, /x-promotion-payout/);
  assert.match(route, /runLifecycleJob/);
  assert.match(route, /runPayoutJob/);
  assert.match(route, /markCronJobSucceeded\(\s*PAYOUT_JOB_NAME/);
  assert.match(route, /markCronJobFailed\(\s*PAYOUT_JOB_NAME/);
});

test('payout failure is isolated while lifecycle failure keeps HTTP failure signal', () => {
  assert.match(
    route,
    /status:\s*lifecycle\.ok \? 200 : 500/,
  );
  assert.match(
    route,
    /ok:\s*lifecycle\.ok\s*&&\s*payout\.ok/,
  );
});

test('maintenance route has more duration headroom without adding cron invocations', () => {
  assert.match(route, /export const maxDuration = 300/);

  const matches = vercel.crons.filter(
    (item) =>
      item.path ===
      '/api/cron/x-promotion-maintenance',
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].schedule, '*/15 * * * *');
});

test('operator attention payout states fail only the payout heartbeat', () => {
  for (const status of [
    'NOT_CONFIGURED',
    'NOT_REGISTERED',
    'MANUAL_INTERVENTION_REQUIRED',
  ]) {
    assert.match(route, new RegExp(status));
  }
  assert.match(route, /PAYOUT_FAILURE_STATUSES\.has/);
});
