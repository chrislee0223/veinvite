import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const homePage = await readFile(
  new URL('../src/app/page.tsx', import.meta.url),
  'utf8',
);
const forecastCard = await readFile(
  new URL('../src/components/PublicRewardForecastCard.tsx', import.meta.url),
  'utf8',
);
const seedProvider = await readFile(
  new URL('../src/components/RewardForecastSeedProvider.tsx', import.meta.url),
  'utf8',
);
const seedServer = await readFile(
  new URL('../src/lib/rewards/publicRewardForecastSeedServer.ts', import.meta.url),
  'utf8',
);

test('first Home render receives a cached public reward forecast seed', () => {
  assert.match(homePage, /readPublicRewardForecastSeed/);
  assert.match(homePage, /Promise\.all\(/);
  assert.match(
    homePage,
    /RewardForecastSeedProvider[\s\S]*initialForecast=\{initialRewardForecast\}[\s\S]*<HomeClient \/>/,
  );

  assert.match(seedServer, /unstable_cache/);
  assert.match(seedServer, /FORECAST_SEED_CACHE_SECONDS = 5 \* 60/);
  assert.match(seedServer, /REWARD_FORECAST_MODEL_VERSION/);
  assert.match(seedServer, /FORECAST_SEED_MAX_AGE_MS = 24 \* 60 \* 60_000/);
  assert.doesNotMatch(seedServer, /refreshRewardForecastSnapshot/);
  assert.doesNotMatch(seedServer, /readVeInviteRewardPoolStatus/);
});

test('server seed is rendered before browser fallback and newer values win', () => {
  assert.match(seedProvider, /createContext<PublicRewardForecastSeed \| null>/);
  assert.match(forecastCard, /useRewardForecastSeed\(\)/);
  assert.match(
    forecastCard,
    /pickPreferredForecast\(serverSeed, cachedForecast\)/,
  );
  assert.match(
    forecastCard,
    /pickPreferredForecast\([\s\S]*serverSeed,[\s\S]*cachedForecast,[\s\S]*restored/s,
  );
  assert.match(
    forecastCard,
    /forecastGeneratedAtMs\(candidate\) >[\s\S]*forecastGeneratedAtMs\(preferred\)/,
  );
  assert.match(forecastCard, /persistForecast\(preferred\)/);
});

test('forecast seed failures and slow reads stay isolated from Home startup', () => {
  assert.match(
    seedServer,
    /FORECAST_SEED_STARTUP_TIMEOUT_MS = 450/,
  );
  assert.match(seedServer, /Promise\.race\(/);
  assert.match(
    seedServer,
    /Public reward forecast seed could not be loaded/,
  );
  assert.match(seedServer, /return null;/);
  assert.doesNotMatch(homePage, /throw new Error\([^)]*forecast/i);
});
