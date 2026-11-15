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

test('legacy explicit funding check is globally rate-limited and still detects funding changes', () => {
  assert.match(
    estimateRoute,
    /refreshRequested && previousSnapshot && !sharedLiveCheckGate[\s\S]*await checkLiveFunding\(previousSnapshot, network\)/,
  );
  assert.match(
    estimateRoute,
    /const fundingChanged = fundingCheck === 'changed'/,
  );
  assert.match(
    estimateRoute,
    /scope: 'public-reward-forecast-live-read'/,
  );
  assert.match(
    estimateRoute,
    /FORECAST_REFRESH_WINDOW_SECONDS = 15 \* 60/,
  );
  assert.match(
    estimateRoute,
    /readPredictiveRewardPlanning/,
  );
  assert.match(
    estimateRoute,
    /readLatestForecastFundingInput/,
  );
  assert.match(
    estimateRoute,
    /snapshotReserveNetFlow !==[\s\S]*planning\.reserveNetFlowWei/,
    'reserve ledger changes must invalidate a fresh snapshot even when the physical pool is unchanged',
  );
  assert.match(
    estimateRoute,
    /snapshotCommitted !==[\s\S]*planning\.cohortReservedWei/,
    'new fixed reward reservations must also invalidate the logical funding snapshot',
  );
  assert.match(
    estimateRoute,
    /snapshotReservedExisting !==[\s\S]*planning\.reservedExistingWei/,
    'changes in any outstanding reward liability must invalidate the forecast pricing basis',
  );
  assert.doesNotMatch(
    estimateRoute,
    /pricingBasisWei !== snapshot\.projectedAllocationWei/,
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

test('public forecast refreshes via one shared CDN path without per-user chain checks', () => {
  assert.match(
    forecastCard,
    /function requestForecast\(\s*bypassMemoryCache = false,?\s*\)/,
  );
  assert.match(
    forecastCard,
    /!bypassMemoryCache\s*&&\s*cachedForecast/,
  );
  assert.doesNotMatch(
    forecastCard,
    /\/api\/rewards\/estimate\?refresh=1/,
  );
  assert.doesNotMatch(
    forecastCard,
    /\/api\/rewards\/estimate\?refresh=\$\{Date\.now\(\)\}/,
  );
  assert.match(
    forecastCard,
    /now - cachedForecastAt < 60_000/,
  );
  assert.match(
    forecastCard,
    /loadForecast\(true\)/,
  );
  assert.match(
    forecastCard,
    /setInterval\(\s*\(\) => \{\s*if \(document.visibilityState !== 'visible'\) return;\s*void loadForecast\(true\);\s*\},\s*PARTICIPATION_REFRESH_MS/s,
  );
  assert.match(
    forecastCard,
    /CLIENT_FORECAST_CACHE_MS = 15 \* 60_000/,
  );
  assert.match(
    forecastCard,
    /PARTICIPATION_REFRESH_MS = 3 \* 60_000/,
  );
  assert.match(
    forecastCard,
    /fetch\(\s*'\/api\/rewards\/estimate',/,
    'short participation refresh must read the shared public endpoint',
  );
  assert.doesNotMatch(forecastCard, /inFlightForecastWasForced/);
  assert.match(
    forecastCard,
    /clearInterval\(participationPollId\)/,
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
  // A late background response must not overwrite a newer visible estimate.
  assert.match(
    forecastCard,
    /setForecast\(\(current\) => pickPreferredForecast\(current, result\)/,
  );
  assert.match(
    forecastCard,
    /pickPreferredForecast\(cachedForecast, result\)/,
  );
});
