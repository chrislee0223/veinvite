import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [homePage, forecastCard, estimateRoute] = await Promise.all([
  read('src/app/page.tsx'),
  read('src/components/PublicRewardForecastCard.tsx'),
  read('src/app/api/rewards/estimate/route.ts'),
]);

test('Home never injects the historical recipient-floor quote into initial paint', () => {
  assert.doesNotMatch(homePage, /RewardForecastSeedProvider|readPublicRewardForecastSeed|HOME_FORECAST_PREFILL_BUDGET_MS/);
  assert.match(homePage, /readWalletSessionBootstrapForFirstPaint/);
  assert.match(homePage, /<HomeClient \/>/);
  assert.doesNotMatch(forecastCard, /useRewardForecastSeed|serverSeed|LEGACY_FORECAST_STORAGE_KEY/);
  assert.match(forecastCard, /pickPreferredForecast\(cachedForecast\)/);
});

test('revised client storage ignores old-model quote and restores current-model values only', () => {
  assert.match(forecastCard, /PUBLIC_ACTIVE_FORECAST_MODEL_VERSION/);
  assert.match(forecastCard, /_recent_v3/);
  assert.match(forecastCard, /isRestorableRewardForecast/);
  assert.match(forecastCard, /useIsomorphicLayoutEffect/);
  assert.match(forecastCard, /persistForecast\(result\)/);
  assert.doesNotMatch(forecastCard, /formatRewardWei\(forecast\.estimatedRewardWei\)/);
  assert.doesNotMatch(forecastCard, /window\.localStorage\.getItem\(\s*LEGACY_FORECAST_STORAGE_KEY/);
});

test('API exposes a new shared-pool amount, never the legacy snapshot estimate', () => {
  assert.match(estimateRoute, /estimatedRewardWei: publicEstimateWei/);
  assert.match(estimateRoute, /PUBLIC_ACTIVE_FORECAST_MODEL_VERSION/);
  assert.doesNotMatch(estimateRoute, /estimatedRewardWei: snapshot\.estimatedRewardWei/);
});
