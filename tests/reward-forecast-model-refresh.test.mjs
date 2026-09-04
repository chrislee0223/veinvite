import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const estimateRoute = await readFile(
  new URL('../src/app/api/rewards/estimate/route.ts', import.meta.url),
  'utf8',
);

test('public estimate invalidates a fresh snapshot from the previous model', () => {
  assert.match(
    estimateRoute,
    /snapshot\.modelVersion !== REWARD_FORECAST_MODEL_VERSION/,
  );
  assert.match(
    estimateRoute,
    /previousSnapshot\.modelVersion !== REWARD_FORECAST_MODEL_VERSION/,
  );
  assert.match(
    estimateRoute,
    /await refreshRewardForecastSnapshot/,
  );
});
