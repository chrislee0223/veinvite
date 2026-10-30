import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const cronPaths = config.crons.map(({ path }) => path);
const expectedRetries = [
  ['reconcile', 'reconcile-retry', 'runDailyReconciliation', 'daily-reconcile'],
  ['analytics-maintenance', 'analytics-maintenance-retry', 'runAnalyticsMaintenance', 'analytics-maintenance'],
];

test('each Vercel cron path is configured once', () => {
  assert.equal(new Set(cronPaths).size, cronPaths.length);
});

for (const [primary, retry, exportedName, claimName] of expectedRetries) {
  test(`${retry} delegates to ${primary} and shares its claim`, () => {
    const primaryRoute = readFileSync(join(root, 'src/app/api/cron', primary, 'route.ts'), 'utf8');
    const retryRoute = readFileSync(join(root, 'src/app/api/cron', retry, 'route.ts'), 'utf8');
    assert.ok(cronPaths.includes(`/api/cron/${primary}`));
    assert.ok(cronPaths.includes(`/api/cron/${retry}`));
    assert.match(retryRoute, new RegExp(`import \\\{ GET as ${exportedName} \\\} from '../${primary}/route'`));
    assert.match(retryRoute, new RegExp(`return ${exportedName}\\(request\\)`));
    assert.ok(primaryRoute.includes(`tryClaimCronJob(\n      '${claimName}'`), `missing claim for ${claimName}`);
  });
}

test('dedicated QA host rejects all API requests', () => {
  const proxy = readFileSync(join(root, 'src/proxy.ts'), 'utf8');
  assert.match(proxy, /pathname\.startsWith\('\/api\/'\) &&\s*isDedicatedQaHost\(host\)/);
  assert.match(proxy, /return notFoundResponse\(\)/);
});
