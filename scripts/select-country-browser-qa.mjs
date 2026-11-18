// Prefer focused browser checks for the already regression-tested country
// ranking movement feature. Any unknown / mixed change runs the full suite.
const COUNTRY_ONLY_PATHS = new Set([
  '.github/workflows/ci.yml',
  'scripts/select-country-browser-qa.mjs',
  'src/app/qa/country-rank-movement/page.tsx',
  'tests/playwright/country-rank-movement-real-ui.spec.ts',
  'src/app/api/leaderboard/country/route.ts',
  'src/app/leaderboard-country-horizontal-balance.css',
  'src/components/PublicLeaderboardHub.tsx',
  'src/lib/countryRankMovement.ts',
  'src/lib/countryLeaderboardClientCache.ts',
  'tests/country-leaderboard-cache.test.mjs',
  'src/lib/types.ts',
  'supabase/migrations/20261117150000_country_rank_movement_previous_round_v1.sql',
  'supabase/production-migration-baseline.txt',
  'supabase/production-migration-observed.txt',
  'tests/ci-country-browser-scope.test.mjs',
  'tests/country-leaderboard-rank-movement.test.mjs',
]);

export function selectCountryBrowserQa(changedPaths) {
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) {
    return 'full';
  }
  if (!changedPaths.every((path) => COUNTRY_ONLY_PATHS.has(path))) {
    return 'full';
  }
  const realUiFeatureChanged =
    changedPaths.includes('src/components/PublicLeaderboardHub.tsx') &&
    changedPaths.includes('src/app/leaderboard-country-horizontal-balance.css');
  const isolatedCountryQaChanged =
    changedPaths.includes('src/app/qa/country-rank-movement/page.tsx') &&
    changedPaths.includes('tests/playwright/country-rank-movement-real-ui.spec.ts');
  const isolatedCountryCacheChanged =
    changedPaths.includes('src/components/PublicLeaderboardHub.tsx') &&
    changedPaths.includes('src/lib/countryLeaderboardClientCache.ts') &&
    changedPaths.includes('src/app/api/leaderboard/country/route.ts');
  if (!realUiFeatureChanged && !isolatedCountryQaChanged &&
      !isolatedCountryCacheChanged) {
    return 'full';
  }
  return 'country';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const paths = (process.env.CHANGED_PATHS ?? '')
    .split('\n')
    .map((path) => path.trim())
    .filter(Boolean);
  process.stdout.write(selectCountryBrowserQa(paths));
}
