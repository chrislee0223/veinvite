import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Network warmup primes header data as soon as wallet authentication is ready and leaves module preloads idle', async () => {
  const [providers, warmup, rootCache, network] = await Promise.all([
    readFile(
      new URL('../src/components/AppProviders.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/components/NetworkIdleWarmup.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/lib/networkRootClientCache.ts', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/components/AppNetwork.tsx', import.meta.url),
      'utf8',
    ),
  ]);

  assert.match(providers, /<NetworkIdleWarmup \/>/);
  assert.match(warmup, /WALLET_SESSION_READY_EVENT = 'veinvite-wallet-session-ready'/);
  assert.match(warmup, /window\.addEventListener\(\s*WALLET_SESSION_READY_EVENT,\s*handleSessionReady/);
  assert.match(warmup, /handleSessionReady[\s\S]*warmData\(\)/);
  assert.match(warmup, /prefetchNetworkRoot\(wallet\)/);
  assert.doesNotMatch(warmup, /prefetchEnrichedNetworkRoot/);
  assert.match(warmup, /prefetchNetworkSummary\(wallet\)\.catch\(\(\) => null\)/);
  assert.match(warmup, /prefetchNetworkInviteSlots\(wallet\)\.catch\(\(\) => null\)/);

  assert.match(warmup, /requestIdleCallback/);
  const dataStart = warmup.indexOf('const warmData = () =>');
  const moduleStart = warmup.indexOf('const warmModules = () =>');
  const dataSlice = warmup.slice(dataStart, moduleStart);
  assert.doesNotMatch(dataSlice, /requestIdleCallback|setTimeout/);
  assert.match(warmup, /import\('\.\/AppGuide'\)/);
  assert.match(warmup, /import\('\.\/AppNetworkHub'\)/);
  assert.match(warmup, /window\.location\.pathname !== '\/'/);

  assert.match(rootCache, /HEADER_STORAGE_KEY = 'veinvite_network_header_metrics_v2'/);
  assert.doesNotMatch(rootCache, /HEADER_TTL_MS/);
  assert.match(rootCache, /getCachedNetworkHeaderMetrics/);
  assert.match(rootCache, /rememberHeaderMetrics\(wallet, data\)/);
  assert.match(rootCache, /NETWORK_HEADER_METRICS_UPDATED_EVENT/);
  assert.doesNotMatch(rootCache, /prefetchEnrichedNetworkRoot|thisRound|roundId|roundEndAt/);

  assert.match(network, /getCachedNetworkHeaderMetrics\(wallet\)/);
  assert.match(network, /NETWORK_HEADER_METRICS_UPDATED_EVENT/);
  assert.match(network, /const headerNetwork =\s*headerMetrics\?\.network \?\? visibleRootData\.summary\.network/);
  assert.doesNotMatch(network, /const headerThisRound|selectedRound/);

  assert.doesNotMatch(warmup, /<AppGuide\b/);
  assert.doesNotMatch(warmup, /<AppNetworkHub\b/);
  assert.doesNotMatch(warmup, /method:\s*['"]POST['"]/);
});
