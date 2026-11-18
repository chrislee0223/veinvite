import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [homePage, homeClient, forecastCard, estimateRoute, serverSeed, sharedReader] = await Promise.all([
  read('src/app/page.tsx'),
  read('src/components/HomeClient.tsx'),
  read('src/components/PublicRewardForecastCard.tsx'),
  read('src/app/api/rewards/estimate/route.ts'),
  read('src/lib/rewards/publicRewardForecastFirstPaint.ts'),
  read('src/lib/rewards/publicElasticForecastReader.ts'),
]);

test('first HTML paint includes only the approved current-cohort estimate', () => {
  assert.doesNotMatch(homePage, /RewardForecastSeedProvider|HOME_FORECAST_PREFILL_BUDGET_MS/);
  assert.match(homePage, /Promise\.all\(\[/);
  assert.match(homePage, /readPublicSharedPoolFirstPaintForecast\(\)/);
  assert.match(homePage, /<HomeClient initialRewardForecast=\{initialRewardForecast\} \/>/);
  assert.match(homeClient, /initialForecast=\{initialRewardForecast\}/);
  assert.match(forecastCard, /normalizeForecastResponse\(initialForecast\)/);
  assert.match(forecastCard, /pickPreferredForecast\([\s\S]*seeded/);
  assert.match(serverSeed, /snapshot\.modelVersion !== REWARD_POOL_OBSERVATION_MODEL_VERSION/);
  assert.match(serverSeed, /elastic\?\.mode !== 'ELASTIC_SCENARIOS'/);
  assert.match(serverSeed, /estimatedRewardWei: elastic\.displayEstimateWei/);
  assert.doesNotMatch(serverSeed, /estimatedRewardWei: snapshot\.estimatedRewardWei/);
  assert.match(serverSeed, /unstable_cache/);
  assert.match(serverSeed, /revalidate: 30/);
  assert.match(serverSeed, /1_250/);
  assert.match(estimateRoute, /readElasticPublicPreview/);
  assert.match(estimateRoute, /FORECAST_REFRESH_WINDOW_SECONDS = 15 \* 60/);
  assert.match(sharedReader, /countActiveSharedPoolReferrals/);
});

test('revised client storage ignores old-model quote and restores current-model values only', () => {
  assert.match(forecastCard, /PUBLIC_ACTIVE_FORECAST_MODEL_VERSION/);
  assert.match(forecastCard, /_recent_v4/);
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

test('cold visitors never see a placeholder B3TR amount before a validated quote', () => {
  // The server seed is best-effort; it can time out or return null. The UI
  // must not invent a reward or show a dash before the first valid estimate.
  assert.match(forecastCard, /const amount = elastic[\s\S]*?: '';/);
  assert.doesNotMatch(forecastCard, /— B3TR/);
  assert.match(forecastCard, /data-forecast-amount-ready=\{elastic \? 'true' : 'false'\}/);
  assert.match(forecastCard, /aria-label=\{ready && !elasticPending \? amount : t\.pendingTitle\}/);

  // Keep Home responsive: no new blocking fetch and no revived pulse.
  assert.match(serverSeed, /Promise\.race\(\[/);
  assert.match(serverSeed, /1_250/);
  assert.match(forecastCard, /min-height:35px/);
  assert.doesNotMatch(forecastCard, /amountSkeleton|forecastSkeletonPulse/);
});
