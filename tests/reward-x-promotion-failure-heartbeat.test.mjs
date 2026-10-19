import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL('../src/app/api/cron/x-promotion-maintenance/route.ts', import.meta.url),
  'utf8',
);

test('X promotion lifecycle heartbeat must detect failed candidates', () => {
  assert.match(route, /result\.opportunitySync/);
  assert.match(route, /failedCount/);
  assert.match(route, /result\.pending\.failed/);
  assert.match(route, /result\.final\.failed/);
  assert.match(route, /markCronJobFailed\(\s*LIFECYCLE_JOB_NAME/);
});
