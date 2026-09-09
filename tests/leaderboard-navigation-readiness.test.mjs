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

test('leaderboard tab waits for both its code chunk and current-wallet data before commit', () => {
  assert.match(
    navigation,
    /const prepareTabForNavigation = \(tab: AppTab\): Promise<void> => \{/,
  );
  assert.match(
    navigation,
    /if \(tab !== 'leaderboard'\) \{\s*return moduleReady;\s*\}/,
  );
  assert.match(
    navigation,
    /return Promise\.all\(\[\s*moduleReady,\s*prefetchPublicLeaderboard\(wallet\),\s*\]\)\.then\(\(\) => undefined\);/,
  );
  assert.match(
    navigation,
    /void prepareTabForNavigation\(tab\)\s*\.then\(\(\) => commitTab\(tab, requestId\)\)/,
  );
});

test('leaderboard pointer, focus and touch warming remains enabled and shares the client in-flight cache', () => {
  assert.match(
    navigation,
    /if \(tab === 'leaderboard'\) \{\s*void prefetchPublicLeaderboard\(wallet\)\.catch\(\(\) => undefined\);\s*\}/,
  );
  assert.match(navigation, /onPointerEnter=.*warmTab\(tab\)/);
  assert.match(navigation, /onFocus=.*warmTab\(tab\)/);
  assert.match(navigation, /onPointerDown=.*warmTab\(tab\)/);
  assert.match(cache, /const inFlight = new Map<string, Promise<PublicLeaderboardResponse>>\(\);/);
  assert.match(cache, /const existing = inFlight\.get\(requestKey\);\s*if \(existing\) return existing;/);
});

test('leaderboard navigation stays fail-open if its endpoint is unavailable', () => {
  assert.match(
    navigation,
    /\.catch\(\(\) => commitTab\(tab, requestId\)\);/,
  );
});

test('rapid tab changes and wallet changes invalidate older leaderboard readiness work', () => {
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

test('the fix does not move leaderboard prefetch back into critical Home startup', () => {
  assert.match(navigation, /APP_READY_EVENT = 'veinvite-app-ready'/);
  assert.match(navigation, /STARTUP_PREFETCH_IDLE_TIMEOUT_MS = 1_200/);
  assert.match(
    navigation,
    /veinviteAppReady === 'true'[\s\S]*schedulePrefetch\(\)/,
  );
  assert.match(navigation, /requestIdleCallback/);
});
