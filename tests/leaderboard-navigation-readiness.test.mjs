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
const avatarWarmup = readFileSync(
  new URL('../src/components/LeaderboardAvatarWarmup.tsx', import.meta.url),
  'utf8',
);
const networkSummaryCache = readFileSync(
  new URL('../src/lib/networkSummaryClientCache.ts', import.meta.url),
  'utf8',
);

test('app-ready warms leaderboard and Network readiness only after Home release', () => {
  assert.match(navigation, /APP_READY_EVENT = 'veinvite-app-ready'/);
  assert.match(navigation, /STARTUP_PREFETCH_IDLE_TIMEOUT_MS = 1_200/);
  assert.match(
    navigation,
    /const IDLE_LAZY_TABS: AppTab\[\] = \['settings'\];/,
  );
  assert.match(
    navigation,
    /const onAppReady = \(\) => \{[\s\S]*preloadTabModule\('leaderboard'\)[\s\S]*preloadTabModule\('guide'\)[\s\S]*warmLeaderboard\(\)[\s\S]*prefetchNetworkSummary\(wallet\)[\s\S]*scheduleModulePrefetch\(\)/,
  );
  assert.match(navigation, /requestIdleCallback/);
  assert.match(
    navigation,
    /IDLE_LAZY_TABS\.map\(\(tab\) => preloadTabModule\(tab\)\)/,
  );
});

test('leaderboard tap waits only for public data when no usable seed exists', () => {
  assert.match(
    navigation,
    /const cachedPublicLeaderboard = getCachedPublicLeaderboard\(null\);/,
  );
  assert.match(
    navigation,
    /if \(cachedPublicLeaderboard\) \{[\s\S]*rememberLeaderboardAvatarTargets\(cachedPublicLeaderboard\)[\s\S]*warmLeaderboard\(\)[\s\S]*return moduleReady;/,
  );
  assert.match(
    navigation,
    /return Promise\.all\(\[\s*moduleReady,\s*warmLeaderboard\(\),\s*\]\)\.then\(\(\) => undefined\);/,
  );
  assert.doesNotMatch(
    navigation,
    /prepareTabForNavigation[\s\S]*prefetchPublicLeaderboard\(wallet\)/,
  );
});

test('Network tap reuses a wallet-keyed summary seed instead of painting the intermediate loading card', () => {
  assert.match(navigation, /getCachedNetworkSummary\(wallet\)/);
  assert.match(
    navigation,
    /if \(cachedNetworkSummary\) \{[\s\S]*prefetchNetworkSummary\(wallet, \{ force: true \}\)[\s\S]*return moduleReady;/,
  );
  assert.match(
    navigation,
    /return Promise\.all\(\[\s*moduleReady,\s*prefetchNetworkSummary\(wallet\),\s*\]\)\.then\(\(\) => undefined\);/,
  );
  assert.match(networkSummaryCache, /veinvite_network_summary_seed_v1/);
  assert.match(networkSummaryCache, /SESSION_TTL_MS = 10_000/);
  assert.match(networkSummaryCache, /const inFlight = new Map<string, Promise<NetworkSummaryProbe>>\(\);/);
});

test('leaderboard pointer, focus and touch warming shares public and avatar work', () => {
  assert.match(
    navigation,
    /if \(tab === 'leaderboard'\) \{\s*void warmLeaderboard\(\)\.catch\(\(\) => undefined\);/,
  );
  assert.match(navigation, /onPointerEnter=.*warmTab\(tab\)/);
  assert.match(navigation, /onFocus=.*warmTab\(tab\)/);
  assert.match(navigation, /onPointerDown=.*warmTab\(tab\)/);
  assert.match(cache, /const inFlight = new Map<string, Promise<PublicLeaderboardResponse>>\(\);/);
  assert.match(cache, /const existing = inFlight\.get\(requestKey\);\s*if \(existing\) return existing;/);
  assert.match(navigation, /<LeaderboardAvatarWarmup addresses=\{leaderboardAvatarAddresses\} \/>/);
});

test('Top 5 plus the current wallet resolve VET-domain avatars before leaderboard entry', () => {
  assert.match(navigation, /data\.leaders\s*\.slice\(0, 5\)/);
  assert.match(navigation, /if \(wallet\) addresses\.push\(wallet\.toLowerCase\(\)\);/);
  assert.match(avatarWarmup, /useVechainDomain/);
  assert.match(avatarWarmup, /useGetAvatar/);
  assert.match(avatarWarmup, /getPicassoImage/);
  assert.match(avatarWarmup, /image\.referrerPolicy = 'no-referrer'/);
  assert.match(avatarWarmup, /veinvite_leaderboard_profile_avatar_v1/);
  assert.match(avatarWarmup, /\.slice\(0, 6\)/);
});

test('public leaderboard seed survives hard refresh without persisting personalized rank data', () => {
  assert.match(cache, /PUBLIC_SESSION_STORAGE_KEY = 'veinvite_public_leaderboard_seed_v1'/);
  assert.match(cache, /PUBLIC_SESSION_MAX_AGE_MS = 5 \* 60_000/);
  assert.match(cache, /candidate\.currentUser === null/);
  assert.match(cache, /data\.currentUser !== null\) return/);
  assert.match(cache, /hydratePublicSessionSeed\(\)/);
  assert.match(cache, /cache: isPersonalized \? 'no-store' : 'default'/);
});

test('secondary navigation stays fail-open if a readiness endpoint is unavailable', () => {
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
