import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  resolveStartupReadiness,
} from '../src/lib/homeStartupReadiness.ts';

const WALLET = '0x1111111111111111111111111111111111111111';

function loadingState(status = 'loading') {
  return {
    status,
    walletAddress: WALLET,
    invitesReady: false,
    referralLinkReady: false,
  };
}

test('only opt-in first paint may reveal matching-wallet Home while API data hydrates', () => {
  const base = {
    walletAddress: WALLET,
    homeState: loadingState(),
    hasBootstrappedSession: true,
    hasPersistedWallet: true,
    interactiveGateVisible: false,
  };

  assert.equal(
    resolveStartupReadiness(base),
    'hold',
  );
  assert.equal(
    resolveStartupReadiness({
      ...base,
      allowHomeDataHydration: true,
    }),
    'release',
  );
  assert.equal(
    resolveStartupReadiness({
      ...base,
      homeState: loadingState('error'),
      allowHomeDataHydration: true,
    }),
    'error',
  );
});

test('wallet switches remain strict after the first reveal', async () => {
  const runtime = await readFile(
    new URL('../src/components/WalletRuntimeLifecycle.tsx', import.meta.url),
    'utf8',
  );

  assert.match(runtime, /const hasReleasedOnceRef = useRef\(false\)/);
  assert.match(runtime, /hasReleasedOnceRef\.current = true/);
  assert.match(
    runtime,
    /allowHomeDataHydration:\s*!hasReleasedOnceRef\.current/,
  );
  assert.match(runtime, /releasedRef\.current = false/);
  assert.match(runtime, /veinvite-app-loading/);
});

test('fresh VeWorld visitors avoid the persisted-wallet 3.5 second settle path', async () => {
  const runtime = await readFile(
    new URL('../src/components/WalletRuntimeLifecycle.tsx', import.meta.url),
    'utf8',
  );

  assert.match(runtime, /BROWSER_WALLET_BOOTSTRAP_SETTLE_MS = 350/);
  assert.match(runtime, /VEWORLD_WALLET_BOOTSTRAP_SETTLE_MS = 3_500/);
  assert.match(
    runtime,
    /const hasPersistedWallet =\s*Boolean\(readPersistedDappKitAccount\(\)\)/,
  );
  assert.match(
    runtime,
    /connection\?\.isInAppBrowser && hasPersistedWallet[\s\S]*VEWORLD_WALLET_BOOTSTRAP_SETTLE_MS[\s\S]*BROWSER_WALLET_BOOTSTRAP_SETTLE_MS/,
  );
});

test('non-critical startup work waits until app-ready and an idle slice', async () => {
  const [providers, deferred, placeholders] = await Promise.all([
    readFile(new URL('../src/components/AppProviders.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DeferredStartupExtras.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/StartupHydrationPlaceholders.tsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(providers, /PublicRewardForecastWarmup/);
  assert.doesNotMatch(providers, /RewardReservationRecovery/);
  assert.match(providers, /<DeferredStartupExtras \/>/);
  assert.match(deferred, /requestIdleCallback/);
  assert.match(deferred, /veinvite-app-ready/);
  assert.match(deferred, /import\('\.\/RewardReservationRecovery'\)/);
  assert.match(deferred, /import\('\.\/PublicRewardForecastPortal'\)/);
  assert.match(
    placeholders,
    /\.linkPreviewSkeleton,[\s\S]*\.slotsSkeleton[\s\S]*visibility:\s*visible\s*!important/,
  );
});
