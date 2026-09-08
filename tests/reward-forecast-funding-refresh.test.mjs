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

test('public estimate refreshes early when live reward-pool funding changes', () => {
  assert.match(
    estimateRoute,
    /readVeInviteRewardPoolStatus/,
  );
  assert.match(
    estimateRoute,
    /pool\.effectiveRewardPoolWei !== snapshot\.observedPoolBalanceWei/,
  );
  assert.match(
    estimateRoute,
    /fundingChanged \|\|/,
  );
  assert.match(
    estimateRoute,
    /public, s-maxage=300, stale-while-revalidate=3600/,
  );
});

test('public forecast forces a fresh check when the user returns to the app', () => {
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
    /\/api\/rewards\/estimate\?refresh=\$\{Date\.now\(\)\}/,
  );
  assert.match(
    forecastCard,
    /loadForecast\(true\)/,
  );
  assert.match(
    forecastCard,
    /setInterval\(\s*loadForecast,\s*CLIENT_FORECAST_CACHE_MS/s,
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
    /setForecast\(detail\)/,
  );
});
