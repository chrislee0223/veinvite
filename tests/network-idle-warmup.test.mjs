import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Network warmup runs only after app-ready and never mounts Network early', async () => {
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
  assert.match(warmup, /import\('\.\/AppNetworkCanaryV71'\)/);
  assert.match(warmup, /import\('\.\/AppNetworkHub'\)/);
  assert.match(warmup, /prefetchNetworkSummary\(wallet\)/);

  assert.doesNotMatch(warmup, /<AppGuide\b/);
  assert.doesNotMatch(warmup, /<AppNetworkCanaryV71\b/);
  assert.doesNotMatch(warmup, /<AppNetworkHub\b/);
  assert.doesNotMatch(warmup, /NetworkPageZoomGuard/);
  assert.doesNotMatch(warmup, /method:\s*['\"]POST['\"]/);
});

test('canary warmup avoids the real-data summary request', async () => {
  const warmup = await readFile(
    new URL('../src/components/NetworkIdleWarmup.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    warmup,
    /if \(normalizedWallet === NETWORK_CANARY_WALLET\) \{[\s\S]*AppNetworkCanaryV71[\s\S]*\} else \{[\s\S]*prefetchNetworkSummary\(wallet\)/,
  );
});
