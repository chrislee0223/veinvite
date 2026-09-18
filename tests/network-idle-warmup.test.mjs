import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Network warmup starts complete data after app-ready and defers only module loading to idle', async () => {
  const [providers, warmup] = await Promise.all([
    readFile(
      new URL('../src/components/AppProviders.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/components/NetworkIdleWarmup.tsx', import.meta.url),
      'utf8',
    ),
  ]);

  assert.match(providers, /<NetworkIdleWarmup \/>/);
  assert.match(warmup, /APP_READY_EVENT = 'veinvite-app-ready'/);
  assert.match(warmup, /veinviteAppReady === 'true'/);
  assert.match(warmup, /requestIdleCallback/);
  assert.match(warmup, /window\.location\.pathname !== '\/'/);

  assert.match(warmup, /import\('\.\/AppGuide'\)/);
  assert.match(warmup, /import\('\.\/AppNetworkHub'\)/);
  assert.match(warmup, /const warmData = \(\) =>/);
  assert.match(warmup, /prefetchNetworkRoot\(wallet\)/);
  assert.match(warmup, /prefetchNetworkSlots\(wallet\)/);
  assert.match(warmup, /rememberNetworkSummary\(wallet/);
  assert.match(warmup, /const warmModules = \(\) =>/);
  assert.match(warmup, /requestIdleCallback/);
  assert.match(warmup, /Promise\.allSettled/);
  const dataStart = warmup.indexOf('const warmData = () =>');
  const moduleStart = warmup.indexOf('const warmModules = () =>');
  assert.ok(dataStart >= 0 && moduleStart > dataStart);
  const dataBody = warmup.slice(dataStart, moduleStart);
  assert.doesNotMatch(dataBody, /requestIdleCallback/);

  assert.doesNotMatch(warmup, /<AppGuide\b/);
  assert.doesNotMatch(warmup, /<AppNetworkHub\b/);
  assert.doesNotMatch(warmup, /method:\s*['"]POST['"]/);
});
