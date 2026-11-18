import assert from 'node:assert/strict';
import test from 'node:test';
import { selectCountryBrowserQa } from '../scripts/select-country-browser-qa.mjs';

const base = [
  'src/components/PublicLeaderboardHub.tsx',
  'src/app/leaderboard-country-horizontal-balance.css',
  'src/app/api/leaderboard/country/route.ts',
  'src/lib/countryRankMovement.ts',
  'src/lib/types.ts',
  'supabase/migrations/20261117150000_country_rank_movement_previous_round_v1.sql',
  'supabase/production-migration-observed.txt',
  'supabase/production-migration-baseline.txt',
  '.github/workflows/ci.yml',
  'tests/country-leaderboard-rank-movement.test.mjs',
  'tests/ci-country-browser-scope.test.mjs',
  'scripts/select-country-browser-qa.mjs',
  'src/app/qa/country-rank-movement/page.tsx',
  'tests/playwright/country-rank-movement-real-ui.spec.ts',
];

test('isolated country leaderboard change uses focused browser QA', () => {
  assert.equal(selectCountryBrowserQa(base), 'country');
});

test('empty/missing/unknown changes always run full browser QA', () => {
  for (const paths of [[], undefined, [...base, 'src/components/AppNetwork.tsx'], [...base, 'package.json']]) {
    assert.equal(selectCountryBrowserQa(paths), 'full');
  }
});

test('do not narrow checks for arbitrary changes to shared types or CI', () => {
  assert.equal(selectCountryBrowserQa(['src/lib/types.ts']), 'full');
  assert.equal(selectCountryBrowserQa(['.github/workflows/ci.yml']), 'full');
  assert.equal(selectCountryBrowserQa(['src/components/PublicLeaderboardHub.tsx']), 'full');
});

test('isolated country cache refactor gets focused browser QA instead of full 812-case suite', () => {
  const paths = [
    'src/components/PublicLeaderboardHub.tsx',
    'src/lib/countryLeaderboardClientCache.ts',
    'src/app/api/leaderboard/country/route.ts',
    'tests/country-leaderboard-cache.test.mjs',
    '.github/workflows/ci.yml',
    'scripts/select-country-browser-qa.mjs',
    'tests/ci-country-browser-scope.test.mjs',
  ];
  assert.equal(selectCountryBrowserQa(paths), 'country');
  assert.equal(
    selectCountryBrowserQa([...paths, 'src/components/PublicRewardForecastCard.tsx']),
    'full',
  );
  assert.equal(
    selectCountryBrowserQa([...paths, 'src/lib/networkSummaryClientCache.ts']),
    'full',
  );
});
