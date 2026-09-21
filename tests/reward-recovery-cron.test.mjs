import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL(
    '../src/app/api/cron/reward-recovery/route.ts',
    import.meta.url,
  ),
  'utf8',
);
const vercelConfig = JSON.parse(
  await readFile(
    new URL('../vercel.json', import.meta.url),
    'utf8',
  ),
);

test('reward recovery cron is protected and runs only reward recovery', () => {
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /timingSafeEqual/);
  assert.match(
    route,
    /request\.headers\.get\('authorization'\)/,
  );
  assert.match(
    route,
    /runAutomaticRewardPayout\(\)/,
  );
  assert.doesNotMatch(
    route,
    /runReconciliationBatch|maintainRoundGrowthSnapshots|publishLeaderboardRoundSnapshots|cleanupEphemeralSecurityState/,
  );
});

test('reward recovery cron runs every five minutes', () => {
  const cron = vercelConfig.crons?.find(
    (entry) =>
      entry.path === '/api/cron/reward-recovery',
  );

  assert.ok(cron);
  assert.equal(cron.schedule, '*/5 * * * *');
});

test('daily reconciliation cron remains unchanged', () => {
  const cron = vercelConfig.crons?.find(
    (entry) => entry.path === '/api/cron/reconcile',
  );

  assert.ok(cron);
  assert.equal(cron.schedule, '17 0 * * *');
});
