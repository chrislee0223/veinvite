import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL(
    '../src/components/RewardReservationRecovery.tsx',
    import.meta.url,
  ),
  'utf8',
);

test('reward recovery never bypasses current-wallet app readiness', () => {
  assert.match(source, /function isCurrentWalletAppReady/);
  assert.match(source, /veinviteAppReady === 'true'/);
  assert.match(source, /veinviteHomeStartupStatus === 'ready'/);
  assert.match(
    source,
    /veinviteHomeStartupWallet[\s\S]*normalizeWallet\(wallet\)/,
  );
  assert.match(
    source,
    /document\.visibilityState !== 'visible' \|\|[\s\S]*!isCurrentWalletAppReady\(requestWallet\)/,
  );
  assert.doesNotMatch(source, /STARTUP_FALLBACK_MS/);
});

test('all recovery triggers remain harmless until authenticated app readiness', () => {
  assert.match(
    source,
    /scheduleInitialRetry[\s\S]*!isCurrentWalletAppReady\(wallet\)/,
  );
  assert.match(
    source,
    /window\.setInterval\([\s\S]*void retry\(\)/,
  );
  assert.match(
    source,
    /const onVisibilityChange = \(\) => \{[\s\S]*document\.visibilityState === 'visible'[\s\S]*void retry\(\)/,
  );
  assert.match(
    source,
    /document\.addEventListener\([\s\S]*'visibilitychange',[\s\S]*onVisibilityChange/,
  );
  assert.match(
    source,
    /APP_READY_EVENT[\s\S]*scheduleInitialRetry/,
  );
});

test('late wallet-A recovery cannot invalidate or refresh wallet B', () => {
  const staleGuard = source.indexOf(
    'if (walletRef.current !== requestWallet)',
  );
  const unauthorizedBranch = source.indexOf(
    'if (response.status === 401)',
  );
  const readyEvent = source.indexOf(
    'new Event(RESERVATION_READY_EVENT)',
  );

  assert.ok(staleGuard >= 0);
  assert.ok(unauthorizedBranch > staleGuard);
  assert.ok(readyEvent > unauthorizedBranch);
  assert.match(
    source,
    /body\.ready === true &&[\s\S]*walletRef\.current === requestWallet/,
  );
});
