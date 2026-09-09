import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const estimateRoute = await readFile(
  new URL('../src/app/api/rewards/estimate/route.ts', import.meta.url),
  'utf8',
);
const forecastCard = await readFile(
  new URL('../src/components/PublicRewardForecastCard.tsx', import.meta.url),
  'utf8',
);

test('normal public estimate serves a fresh snapshot before any live pool RPC', () => {
  assert.match(
    estimateRoute,
    /request\.nextUrl\.searchParams\.has\('refresh'\)/,
  );
  assert.match(
    estimateRoute,
    /const FORCE_CACHE_CONTROL = 'private, no-store, max-age=0'/,
  );
  assert.match(
    estimateRoute,
    /public, s-maxage=300, stale-while-revalidate=3600/,
  );
  assert.match(
    estimateRoute,
    /async function checkLiveFunding/,
  );
  assert.match(
    estimateRoute,
    /pool\.effectiveRewardPoolWei !== snapshot\.observedPoolBalanceWei/,
  );

  const getBody = estimateRoute.slice(
    estimateRoute.indexOf('export async function GET'),
  );
  const normalFastPath = getBody.indexOf('!refreshRequested');
  const liveFundingCheck = getBody.indexOf(
    'await checkLiveFunding(previousSnapshot, network)',
  );
  assert.ok(normalFastPath >= 0, 'normal fresh-snapshot fast path must exist');
  assert.ok(
    liveFundingCheck > normalFastPath,
    'fresh normal requests must return before the live funding RPC path',
  );
});

test('explicit background refresh still detects pool funding changes', () => {
  assert.match(
    estimateRoute,
    /refreshRequested && previousSnapshot[\s\S]*await checkLiveFunding\(previousSnapshot, network\)/,
  );
  assert.match(
    estimateRoute,
    /const fundingChanged = fundingCheck === 'changed'/,
  );
  assert.match(
    estimateRoute,
    /fundingChanged \|\|/,
  );
  assert.match(
    estimateRoute,
    /fundingCheck === 'unavailable'[\s\S]*readyResponse\([\s\S]*previousSnapshot,[\s\S]*true/s,
    'a transient live RPC failure should keep the last snapshot visible as stale',
  );
});

test('public forecast refreshes in the background without focus or visibility request storms', () => {
  assert.match(
    forecastCard,
    /function requestForecast\(force = false\)/,
  );
  assert.match(
    forecastCard,
    /\!force\s*&&\s*cachedForecast/,
  );
  assert.match(
    forecastCard,
    /'\/api\/rewards\/estimate\?refresh=1'/,
  );
  assert.doesNotMatch(
    forecastCard,
    /\/api\/rewards\/estimate\?refresh=\$\{Date\.now\(\)\}/,
  );
  assert.match(
    forecastCard,
    /LIVE_REFRESH_THROTTLE_MS = 60_000/,
  );
  assert.match(
    forecastCard,
    /now - lastLiveRefreshAt < LIVE_REFRESH_THROTTLE_MS/,
  );
  assert.match(
    forecastCard,
    /loadForecast\(true\)/,
  );
  assert.match(
    forecastCard,
    /setInterval\(\s*\(\) => \{\s*void loadForecast\(true\);\s*\},\s*CLIENT_FORECAST_CACHE_MS/s,
  );
  assert.match(
    forecastCard,
    /CLIENT_FORECAST_CACHE_MS = 15 \* 60_000/,
  );
  assert.doesNotMatch(
    forecastCard,
    /setInterval\([^)]*,\s*60_000\s*,?\s*\)/s,
  );
});

test('a refreshed forecast is propagated into the currently visible card', () => {
  assert.match(
    forecastCard,
    /REWARD_FORECAST_UPDATED_EVENT = 'veinvite-reward-forecast-updated'/,
  );
  assert.match(
    forecastCard,
    /window\.dispatchEvent\([\s\S]*REWARD_FORECAST_UPDATED_EVENT/s,
  );
  assert.match(
    forecastCard,
    /window\.addEventListener\([\s\S]*REWARD_FORECAST_UPDATED_EVENT[\s\S]*syncRefreshedForecast/s,
  );
  assert.match(
    forecastCard,
    /setForecast\(result\)/,
  );
});
