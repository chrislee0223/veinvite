import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('first wallet login re-arms Home startup readiness after anonymous Home was already visible', async () => {
  const source = await readFile(
    new URL('../src/components/WalletRuntimeLifecycle.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /APP_LOADING_EVENT\s*=\s*'veinvite-app-loading'/);
  assert.match(source, /lastStartupWalletRef/);
  assert.match(source, /releasedRef\.current\s*=\s*false/);
  assert.match(
    source,
    /dataset\.veinviteAppReady\s*=\s*'false'/,
  );
  assert.match(
    source,
    /dispatchEvent\(new Event\(APP_LOADING_EVENT\)\)/,
  );
});

test('startup shield can be re-armed for first login and released again only after final Home readiness', async () => {
  const source = await readFile(
    new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /APP_LOADING_EVENT\s*=\s*'veinvite-app-loading'/);
  assert.match(source, /const handleAppLoading = \(\) =>/);
  assert.match(source, /released\s*=\s*false/);
  assert.match(source, /setState\(\{ status: 'loading' \}\)/);
  assert.match(
    source,
    /addEventListener\(\s*APP_LOADING_EVENT,\s*handleAppLoading/s,
  );
  assert.doesNotMatch(
    source,
    /APP_READY_EVENT,\s*handleAppReady,\s*\{ once: true \}/s,
  );
});

test('transient wallet verification failures stay on checking UI before showing a real error', async () => {
  const source = await readFile(
    new URL('../src/components/WalletSessionGate.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /SESSION_ERROR_SURFACE_DELAY_MS\s*=\s*600/,
  );
  assert.match(source, /pendingErrorTimerRef/);
  assert.match(
    source,
    /pendingErrorTimerRef\.current\s*=\s*window\.setTimeout\([\s\S]*setState\('error'\)[\s\S]*SESSION_ERROR_SURFACE_DELAY_MS/s,
  );
  assert.doesNotMatch(
    source,
    /setVerifiedWallet\(null\);\s*setState\('error'\);/s,
  );
});
