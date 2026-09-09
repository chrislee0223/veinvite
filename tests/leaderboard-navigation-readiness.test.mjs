import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const navigation = readFileSync(
  new URL('../src/components/AppBottomNavigation.tsx', import.meta.url),
  'utf8',
);
const cache = readFileSync(
  new URL('../src/lib/leaderboardClientCache.ts', import.meta.url),
  'utf8',
);

test('app-ready warms anonymous leaderboard immediately while lazy modules remain idle work', () => {
  assert.match(navigation, /APP_READY_EVENT = 'veinvite-app-ready'/);
  assert.match(navigation, /STARTUP_PREFETCH_IDLE_TIMEOUT_MS = 1_200/);
  assert.match(
    navigation,
    /const onAppReady = \(\) => \{[\s\S]*prefetchPublicLeaderboard\(null\)[\s\S]*scheduleModulePrefetch\(\)/,
  );
  assert.match(navigation, /requestIdleCallback/);
  assert.match(
    navigation,
    /LAZY_TABS\.map\(\(tab\) => preloadTabModule\(tab\)\)/,
  );
  assert.doesNotMatch(
    navigation,
    /runModulePrefetch[\s\S]*prefetchPublicLeaderboard\(wallet\)/,
  );
});

test('leaderboard tap waits only for public data when no usable seed exists', () => {
  assert.match(
    navigation,
    /const cachedPublicLeaderboard = getCachedPublicLeaderboard\(null\);/,
  );
  assert.match(
    navigation,
    /if \(cachedPublicLeaderboard\) \{[\s\S]*prefetchPublicLeaderboard\(null\)[\s\S]*return moduleReady;/,
  );
  assert.match(
    navigation,
    /return Promise\.all\(\[\s*moduleReady,\s*prefetchPublicLeaderboard\(null\),\s*\]\)\.then\(\(\) => undefined\);/,
  );
  assert.doesNotMatch(
    navigation,
    /prepareTabForNavigation[\s\S]*prefetchPublicLeaderboard\(wallet\)/,
  );
});

test('leaderboard pointer, focus and touch warming uses the public request and shares in-flight work', () => {
  assert.match(
    navigation,
    /if \(tab === 'leaderboard'\) \{\s*void prefetchPublicLeaderboard\(null\)\.catch\(\(\) => undefined\);\s*\}/,
  );
  assert.match(navigation, /onPointerEnter=.*warmTab\(tab\)/);
  assert.match(navigation, /onFocus=.*warmTab\(tab\)/);
  assert.match(navigation, /onPointerDown=.*warmTab\(tab\)/);
  assert.match(cache, /const inFlight = new Map<string, Promise<PublicLeaderboardResponse>>\(\);/);
  assert.match(cache, /const existing = inFlight\.get\(requestKey\);\s*if \(existing\) return existing;/);
});

test('public leaderboard seed survives hard refresh without persisting personalized rank data', () => {
  assert.match(cache, /PUBLIC_SESSION_STORAGE_KEY = 'veinvite_public_leaderboard_seed_v1'/);
  assert.match(cache, /PUBLIC_SESSION_MAX_AGE_MS = 5 \* 60_000/);
  assert.match(cache, /candidate\.currentUser === null/);
  assert.match(cache, /data\.currentUser !== null\) return/);
  assert.match(cache, /hydratePublicSessionSeed\(\)/);
  assert.match(cache, /cache: isPersonalized \? 'no-store' : 'default'/);
});

test('leaderboard navigation stays fail-open if its public endpoint is unavailable', () => {
  assert.match(
    navigation,
    /\.catch\(\(\) => commitTab\(tab, requestId\)\);/,
  );
});

test('rapid tab changes and wallet changes still invalidate older navigation work', () => {
  assert.match(
    navigation,
    /const requestId = \+\+navigationRequestRef\.current;/,
  );
  assert.match(
    navigation,
    /if \(navigationRequestRef\.current !== requestId\) return;/,
  );
  assert.match(
    navigation,
    /navigationRequestRef\.current \+= 1;\s*pendingMotionTabRef\.current = null;\s*setVisualTarget\(activeTab\);/,
  );
  assert.match(
    navigation,
    /\}, \[activeTab, wallet, setVisualTarget\]\);/,
  );
});
