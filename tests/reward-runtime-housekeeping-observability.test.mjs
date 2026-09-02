import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [cronRoute, analyticsMigration] = await Promise.all([
  read('src/app/api/cron/reconcile/route.ts'),
  read('supabase/migrations/20260903022000_optimize_usage_analytics_date_scans.sql'),
]);

test('scheduled housekeeping failure is visible without skipping later monitoring', () => {
  assert.match(cronRoute, /\| 'HOUSEKEEPING'/);
  assert.match(cronRoute, /failedStages\.push\('HOUSEKEEPING'\)/);
  assert.match(cronRoute, /logStageFailure\('HOUSEKEEPING', cleanupError\)/);

  const housekeepingIndex = cronRoute.indexOf(
    "failedStages.push('HOUSEKEEPING')",
  );
  const monitoringIndex = cronRoute.indexOf(
    'await runOperatorMonitoringAudit(',
  );
  assert.ok(housekeepingIndex >= 0);
  assert.ok(monitoringIndex > housekeepingIndex);

  assert.match(cronRoute, /status: hasStageFailure \? 500 : 200/);
  assert.match(cronRoute, /partialFailure: hasStageFailure/);
});

test('analytics optimization stays isolated from reward and referral tables', () => {
  assert.match(
    analyticsMigration,
    /app_usage_sessions_seoul_date_idx/,
  );
  assert.match(
    analyticsMigration,
    /started_at at time zone 'Asia\/Seoul'/i,
  );
  assert.doesNotMatch(analyticsMigration, /\binvitations\b/i);
  assert.doesNotMatch(analyticsMigration, /\breward_/i);
  assert.doesNotMatch(analyticsMigration, /\breferral_/i);
});
