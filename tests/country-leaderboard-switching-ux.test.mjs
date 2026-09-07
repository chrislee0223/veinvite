import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const hub = readFileSync(
  join(root, 'src/components/PublicLeaderboardHub.tsx'),
  'utf8',
);
const entry = readFileSync(
  join(root, 'src/components/PublicLeaderboard.tsx'),
  'utf8',
);

test('country leaderboard preloads in the background without a visible loading label', () => {
  assert.match(hub, /useEffect\(\(\) => \{[\s\S]*refreshCountry\(false\)/);
  assert.doesNotMatch(hub, /leaderboardCopy\.loading/);
  assert.match(hub, /className="countrySkeleton"/);
});

test('inviter ranking no longer renders the redundant TOP 100 label', () => {
  assert.doesNotMatch(hub, />TOP 100</);
  assert.match(hub, /className="rankingMeta"/);
});

test('country rows keep NEW and RETURNING internal-only', () => {
  assert.doesNotMatch(hub, /row\.newUsers/);
  assert.doesNotMatch(hub, /row\.returningUsers/);
  assert.doesNotMatch(hub, /className="countryMix"/);
});

test('country and inviter ranking viewports stay on the same responsive five-row geometry', () => {
  assert.doesNotMatch(hub, /\.inviterInside \.rankScroll \{[\s\S]*height:/);
  assert.match(entry, /\.countryRow,[\s\S]*\.countryPlaceholderRow \{[\s\S]*height:50px !important;/);
  assert.match(entry, /\.countryScroll,[\s\S]*\.countrySkeleton,[\s\S]*\.countryState \{[\s\S]*height:250px !important;/);
  assert.match(entry, /@media \(max-width:420px\)[\s\S]*height:46px !important;[\s\S]*height:230px !important;/);
  assert.match(entry, /@media \(max-width:360px\)[\s\S]*height:44px !important;[\s\S]*height:220px !important;/);
});

test('country data remains cached and silently refreshed for fast repeat tab switches', () => {
  assert.match(hub, /COUNTRY_CACHE_TTL_MS\s*=\s*60_000/);
  assert.match(hub, /getFreshCountryCache\(\)/);
  assert.match(hub, /countryInFlight/);
  assert.match(hub, /const openCountry = useCallback\([\s\S]*refreshCountry\(false\)/);
});
