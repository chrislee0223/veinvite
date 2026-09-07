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
    /public, s-maxage=60, stale-while-revalidate=30/,
  );
});

test('public forecast client no longer holds the estimate for fifteen minutes', () => {
  assert.match(
    forecastPortal,
    /CLIENT_FORECAST_REFRESH_MS = 60_000/,
  );
  assert.doesNotMatch(
    forecastPortal,
    /15 \* 60_000/,
  );
  assert.match(
    forecastPortal,
    /cache: 'no-store'/,
  );
  assert.match(
    forecastPortal,
    /window\.setInterval\([\s\S]*CLIENT_FORECAST_REFRESH_MS/,
  );
});
