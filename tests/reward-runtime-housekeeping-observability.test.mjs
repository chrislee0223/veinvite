import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [cronRoute, analyticsMigration, tracker] = await Promise.all([
  read('src/app/api/cron/reconcile/route.ts'),
  read('supabase/migrations/20260903022000_optimize_usage_analytics_date_scans.sql'),
  read('src/components/UsageAnalyticsTracker.tsx'),
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

  assert.match(cronRoute, /status: hasCoreFailure \? 500 : 200/);
  assert.match(cronRoute, /partialFailure: hasCoreFailure/);
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

test('analytics tracking remains non-fatal and avoids redundant transition writes', () => {
  assert.match(tracker, /const cryptoApi = globalThis\.crypto/);
  assert.match(
    tracker,
    /typeof cryptoApi\.getRandomValues === 'function'/,
  );
  assert.match(tracker, /Math\.random\(\) \* 256/);

  assert.match(
    tracker,
    /send\('pageview', nextView, delta\)/,
  );
  assert.doesNotMatch(
    tracker,
    /flushEngaged\('heartbeat'\);\s*currentViewRef\.current = nextView;\s*send\('pageview', nextView\);/,
  );

  const languageHandlerStart = tracker.indexOf(
    'const onLanguageChange =',
  );
  const languageHandlerEnd = tracker.indexOf(
    "document.addEventListener(\n      'visibilitychange'",
    languageHandlerStart,
  );
  assert.ok(languageHandlerStart >= 0);
  assert.ok(languageHandlerEnd > languageHandlerStart);
  const languageHandler = tracker.slice(
    languageHandlerStart,
    languageHandlerEnd,
  );
  assert.doesNotMatch(languageHandler, /send\('heartbeat'\)/);

  assert.doesNotMatch(tracker, /@\/lib\/rewards\//);
  assert.doesNotMatch(tracker, /@\/lib\/referral/);
});
