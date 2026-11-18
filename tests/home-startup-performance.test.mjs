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

test('first paint keeps wallet Home covered while API data hydrates', () => {
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
    'hold',
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

test('a ready label alone can never reveal partial wallet Home data', () => {
  const base = {
    walletAddress: WALLET,
    hasBootstrappedSession: true,
    hasPersistedWallet: true,
    interactiveGateVisible: false,
    allowHomeDataHydration: true,
  };

  for (const [invitesReady, referralLinkReady] of [
    [false, false],
    [true, false],
    [false, true],
  ]) {
    assert.equal(
      resolveStartupReadiness({
        ...base,
        homeState: {
          status: 'ready',
          walletAddress: WALLET,
          invitesReady,
          referralLinkReady,
        },
      }),
      'hold',
    );
  }

  assert.equal(
    resolveStartupReadiness({
      ...base,
      homeState: {
        status: 'ready',
        walletAddress: WALLET,
        invitesReady: true,
        referralLinkReady: true,
      },
    }),
    'release',
  );
});

test('wallet switches remain strict after the first reveal without replaying the global shield', async () => {
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
  assert.doesNotMatch(runtime, /veinvite-app-loading/);
  assert.doesNotMatch(
    runtime,
    /veinviteAppReady\s*=\s*'false'/,
  );
  assert.match(
    runtime,
    /resolveStartupReadiness\(\{[\s\S]*walletAddress:\s*walletRef\.current,[\s\S]*homeState:\s*currentHomeState/,
  );
  assert.match(
    runtime,
    /if \(decision === 'release'\) \{[\s\S]*scheduleStableRelease\(walletRef\.current\)/,
  );
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
  // The 350ms delay is only useful when a real provider account might be
  // restored. A settled SDK with no persisted wallet is already anonymous.
  assert.match(
    runtime,
    /if \(connection\?\.isLoading === false && !hasPersistedWallet\) \{\s*setWalletBootstrapSettled\(true\);\s*return;\s*\}/,
  );
  assert.match(
    runtime,
    /if \(connection\?\.isLoading\) \{\s*setWalletBootstrapSettled\(false\);\s*return;\s*\}/,
  );
  assert.match(
    runtime,
    /connection\?\.isInAppBrowser[\s\S]*VEWORLD_WALLET_BOOTSTRAP_SETTLE_MS[\s\S]*BROWSER_WALLET_BOOTSTRAP_SETTLE_MS/,
  );
  // The strict wallet/session readiness gate still checks verified SSR
  // evidence and both protected Home resources before unmasking Home.
  assert.match(runtime, /resolveStartupReadiness\(\{/);
  assert.match(runtime, /hasBootstrappedSession:\s*hasBootstrappedSession\(\)/);
  assert.match(runtime, /hasPersistedWallet:\s*hasPersistedVeWorldWallet\(\)/);
  assert.match(runtime, /HOME_STABILITY_MS = 160/);
});

test('startup loading observers ignore unrelated attribute updates but still detect gate transitions', async () => {
  const [runtime, shield] = await Promise.all([
    readFile(new URL('../src/components/WalletRuntimeLifecycle.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url), 'utf8'),
  ]);
  for (const source of [runtime, shield]) {
    assert.match(source, /childList: true,\s*subtree: true,\s*attributes: true,/);
    assert.match(source, /attributeFilter: \[\s*'data-veinvite-wallet-session-gate',\s*'data-veinvite-legal-consent-gate',/);
    assert.match(source, /new MutationObserver/);
  }
  assert.match(shield, /HOME_STARTUP_STATE_EVENT/);
  assert.match(runtime, /HOME_STARTUP_STATE_EVENT/);
});

test('Home forecast waits for app-ready while reward reservation recovery remains independent', async () => {
  const [providers, forecastCard, placeholders] = await Promise.all([
    readFile(new URL('../src/components/AppProviders.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/PublicRewardForecastCard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/StartupHydrationPlaceholders.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(providers, /<RewardReservationRecovery \/>/);
  assert.doesNotMatch(providers, /DeferredStartupExtras/);
  assert.doesNotMatch(providers, /PublicRewardForecastWarmup/);
  assert.match(forecastCard, /APP_READY_EVENT = 'veinvite-app-ready'/);
  assert.match(forecastCard, /requestIdleCallback/);
  assert.match(
    forecastCard,
    /veinviteAppReady === 'true'[\s\S]*scheduleForecastActivity\(\)/,
  );
  assert.match(
    forecastCard,
    /addEventListener\([\s\S]*APP_READY_EVENT,[\s\S]*scheduleForecastActivity/,
  );
  assert.match(
    forecastCard,
    /requestIdleCallback\([\s\S]*startForecastActivity/,
  );
  assert.match(
    forecastCard,
    /startForecastActivity[\s\S]*loadForecast\(\)[\s\S]*setInterval/,
  );
  assert.doesNotMatch(
    placeholders,
    /\.linkPreviewSkeleton,[\s\S]*\.slotsSkeleton[\s\S]*visibility:\s*visible\s*!important/,
  );
});

test('invite-only visual and language enhancements stay out of normal Home startup', async () => {
  const [providers, scoped, picker] = await Promise.all([
    readFile(new URL('../src/components/AppProviders.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/RouteScopedInviteEnhancements.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/HeaderLanguagePickerPortal.tsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(providers, /from '\.\/HeaderLanguagePickerPortal'/);
  assert.doesNotMatch(providers, /from '\.\/InviteFlowVisualPolish'/);
  assert.match(providers, /<RouteScopedInviteEnhancements \/>/);

  assert.match(scoped, /import\('\.\/HeaderLanguagePickerPortal'\)/);
  assert.match(scoped, /import\('\.\/InviteFlowVisualPolish'\)/);
  assert.match(scoped, /pathname\.startsWith\('\/i\/'\)/);
  assert.match(scoped, /pathname\.startsWith\('\/r\/'\)/);
  assert.match(scoped, /pathname\.startsWith\('\/ui-test'\)/);
  assert.match(scoped, /if \(!needsInviteEnhancements\(pathname\)\) \{[\s\S]*return null;/);

  // The body-wide observer is still available where the invite picker is
  // actually needed, but normal Home no longer mounts it at all.
  assert.match(picker, /new MutationObserver\(scheduleAttach\)/);
});

test('background invite recovery no longer competes with the authoritative Home startup load', async () => {
  const refresh = await readFile(
    new URL('../src/components/InviteStatusAutoRefresh.tsx', import.meta.url),
    'utf8',
  );

  assert.match(refresh, /APP_READY_EVENT = 'veinvite-app-ready'/);
  assert.match(refresh, /INITIAL_CHECK_FALLBACK_MS = 5_000/);
  assert.match(refresh, /requestIdleCallback/);
  assert.match(
    refresh,
    /veinviteAppReady === 'true'[\s\S]*startInitialCheck\(\)/,
  );
  assert.match(
    refresh,
    /addEventListener\([\s\S]*APP_READY_EVENT,[\s\S]*startInitialCheck/,
  );
  assert.match(
    refresh,
    /setTimeout\([\s\S]*startInitialCheck,[\s\S]*INITIAL_CHECK_FALLBACK_MS/,
  );
  assert.doesNotMatch(
    refresh,
    /if \(!walletAddress\) \{\s*return;\s*\}\s*void check\(\);/,
  );
});


test('Home readiness defers noncritical leaderboard/network warmup to idle without delaying tab taps', async () => {
  const nav = await readFile(
    new URL('../src/components/AppBottomNavigation.tsx', import.meta.url),
    'utf8',
  );

  const onAppReady = nav.slice(
    nav.indexOf('const onAppReady = () => {'),
    nav.indexOf('if (\n      document.documentElement.dataset.veinviteAppReady'),
  );
  assert.match(onAppReady, /scheduleModulePrefetch\(\)/);
  assert.doesNotMatch(onAppReady, /preloadTabModule\(|warmLeaderboard\(|prefetchNetworkRoot\(|prefetchNetworkSummary\(/);

  const warmup = nav.slice(
    nav.indexOf('const runModulePrefetch = () => {'),
    nav.indexOf('const scheduleModulePrefetch = () => {'),
  );
  assert.match(warmup, /preloadTabModule\(tab as AppTab\)/);
  assert.match(warmup, /warmLeaderboard\(\)/);
  assert.match(warmup, /prefetchNetworkSummary\(wallet\)/);
  assert.match(warmup, /prefetchNetworkRoot\(wallet\)/);
  assert.match(nav, /requestIdleCallback\([\s\S]*STARTUP_PREFETCH_IDLE_TIMEOUT_MS/);
  assert.match(nav, /const prepareTabForNavigation = \(tab: AppTab\)/);
  assert.match(nav, /const moduleReady = preloadTabModule\(tab\)/);
  assert.match(nav, /warmLeaderboard\(\),/);
});
