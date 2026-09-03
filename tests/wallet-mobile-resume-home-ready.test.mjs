import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  walletControl,
  walletResume,
  walletRuntime,
  appProviders,
] = await Promise.all([
  readFile('src/components/WalletControl.tsx', 'utf8'),
  readFile('src/components/WalletConnectionResume.tsx', 'utf8'),
  readFile('src/components/WalletRuntimeLifecycle.tsx', 'utf8'),
  readFile('src/components/AppProviders.tsx', 'utf8'),
]);

test('explicit wallet connects record a mobile-resume intent before opening the modal', () => {
  assert.match(walletControl, /markWalletConnectIntent\(\);\s*openConnectModal\(\);/);
});

test('VeWorld recovery only arms after the browser actually leaves and returns', () => {
  assert.match(walletResume, /leftPageForWalletRef/);
  assert.match(walletResume, /window\.addEventListener\('pagehide', armDeparture\)/);
  assert.match(walletResume, /window\.addEventListener\('blur', armDeparture\)/);
  assert.match(walletResume, /document\.visibilityState === 'hidden'/);
  assert.match(walletResume, /!leftPageForWalletRef\.current/);
  assert.match(walletResume, /Opening the connect modal itself is not proof/);
  assert.doesNotMatch(walletResume, /isConnectModalOpen\s*\?\s*window\.setInterval/);
});

test('VeWorld app return rehydrates dapp-kit and has a bounded reload fallback', () => {
  assert.match(walletResume, /initializeAsync/);
  assert.match(walletResume, /readPersistedDappKitAccount\(\)/);
  assert.match(walletResume, /RELOAD_GUARD_TTL_MS/);
  assert.match(walletResume, /alreadyReloaded/);
  assert.match(walletResume, /window\.location\.reload\(\)/);
  assert.match(walletResume, /<Brand compact \/>/);
});

test('wallet resume recovery is mounted inside the VeChain provider', () => {
  assert.match(appProviders, /<WalletConnectionResume \/>/);
  assert.match(
    appProviders,
    /<WalletConnectionResume \/>\s*<WalletRuntimeLifecycle \/>/,
  );
});

test('startup shield waits for referral link and friend slots to settle', () => {
  assert.match(walletRuntime, /HOME_DATA_MAX_WAIT_MS = 4_500/);
  assert.match(walletRuntime, /\.linkPreviewSkeleton, \.slotsSkeleton/);
  assert.match(walletRuntime, /hasPendingHomeData\(\)/);
  assert.match(walletRuntime, /HOME_DATA_MAX_WAIT_MS - elapsed/);
  assert.match(walletRuntime, /HOME_STABILITY_MS/);
});
