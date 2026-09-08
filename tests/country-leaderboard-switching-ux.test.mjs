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
const countryCopy = readFileSync(
  join(root, 'src/lib/i18n/countryLeaderboardCopy.ts'),
  'utf8',
);

test('country leaderboard preloads in the background without a visible loading label', () => {
  assert.match(hub, /useEffect\(\(\) => \{[\s\S]*refreshCountry\(false\)/);
  assert.doesNotMatch(hub, /leaderboardCopy\.loading/);
});

test('cold country-tab clicks keep the inviter rows visible until country data or an error is ready', () => {
  assert.match(
    hub,
    /const visibleRankingView: RankingView =\s*rankingView === 'country' && \(showCountryData \|\| showCountryError\)[\s\S]*\? 'country'[\s\S]*: 'inviter';/,
  );
  assert.match(hub, /\{visibleRankingView === 'inviter' \? \(/);
  assert.match(hub, /className="countrySkeleton"/);
});

test('ranking card removes redundant metadata chrome', () => {
  assert.doesNotMatch(hub, />TOP 100</);
  assert.doesNotMatch(hub, /className="rankingMeta"/);
  assert.doesNotMatch(hub, /countryCopy\.(known|unknown)/);
  assert.doesNotMatch(hub, /knownCompleted|unknownCompleted|totalCountryEligible/);
});

test('ranking tabs use a simple text-only treatment without decorative icons or active fill', () => {
  assert.doesNotMatch(hub, /♙|◎/);
  assert.doesNotMatch(hub, /aria-hidden="true">[^<]*<\/span>\s*<span>\{countryCopy\.(inviterTab|countryTab)\}/);
  assert.match(hub, /\.rankingTabs button::after \{/);
  assert.match(hub, /\.rankingTabs button\.active::after \{/);
  assert.match(
    hub,
    /\.rankingTabs button\.active \{[\s\S]*background:transparent;[\s\S]*box-shadow:none;/,
  );
});

test('country rows keep NEW and RETURNING internal-only', () => {
  assert.doesNotMatch(hub, /row\.newUsers/);
  assert.doesNotMatch(hub, /row\.returningUsers/);
  assert.doesNotMatch(hub, /className="countryMix"/);
});

test('country header uses arrival count copy and the empty state stays user-facing', () => {
  assert.match(hub, /countryCopy\.count/);
  assert.match(countryCopy, /ko:\s*\{[\s\S]*count: '유입 수'/);
  assert.match(countryCopy, /empty: '아직 국가별 유입 기록이 없어요\.'/);
  assert.doesNotMatch(countryCopy, /known: string|unknown: string/);
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
