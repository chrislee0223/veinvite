import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const estimateRoute = await readFile(
  new URL('../src/app/api/rewards/estimate/route.ts', import.meta.url),
  'utf8',
);
const forecastPortal = await readFile(
  new URL('../src/components/PublicRewardForecastPortal.tsx', import.meta.url),
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
    forecastPortal,
    /function requestForecast\(force = false\)/,
  );
  assert.match(
    forecastPortal,
    /\!force\s*&&\s*cachedForecast/,
  );
  assert.match(
    forecastPortal,
    /\/api\/rewards\/estimate\?refresh=\$\{Date\.now\(\)\}/,
  );
  assert.match(
    forecastPortal,
    /loadForecast\(true\)/,
  );
  assert.match(
    forecastPortal,
    /setInterval\(\s*loadForecast,\s*15\s*\*\s*60_000/s,
  );
  assert.doesNotMatch(
    forecastPortal,
    /setInterval\([^)]*,\s*60_000\s*,?\s*\)/s,
  );
});

test('a refreshed forecast is propagated into the currently visible card', () => {
  assert.match(
    forecastPortal,
    /REWARD_FORECAST_UPDATED_EVENT = 'veinvite-reward-forecast-updated'/,
  );
  assert.match(
    forecastPortal,
    /window\.dispatchEvent\([\s\S]*REWARD_FORECAST_UPDATED_EVENT/s,
  );
  assert.match(
    forecastPortal,
    /window\.addEventListener\([\s\S]*REWARD_FORECAST_UPDATED_EVENT[\s\S]*syncRefreshedForecast/s,
  );
  assert.match(
    forecastPortal,
    /setForecast\(detail\)/,
  );
});
