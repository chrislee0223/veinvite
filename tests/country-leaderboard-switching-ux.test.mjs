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
const metricCopy = readFileSync(
  join(root, 'src/lib/i18n/countryArrivalMetricCopy.ts'),
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

test('country rows expose new returning and total users directly without a secondary click', () => {
  assert.match(hub, /row\.newUsers\.toLocaleString\(locale\)/);
  assert.match(hub, /row\.returningUsers\.toLocaleString\(locale\)/);
  assert.match(hub, /row\.completedReferrals\.toLocaleString\(locale\)/);
  assert.match(hub, /className="countryMetricValue countryNew"/);
  assert.match(hub, /className="countryMetricValue countryReturning"/);
  assert.match(hub, /className="countryMetricValue countryTotal"/);
  assert.doesNotMatch(hub, /className="roundGain"/);
  assert.doesNotMatch(hub, /currentRoundCompleted\.toLocaleString/);
});

test('country header uses dedicated localized labels for new returning and total arrivals', () => {
  assert.match(hub, /COUNTRY_ARRIVAL_METRIC_COPY\[locale\]/);
  assert.match(hub, /countryMetricCopy\.newUsers/);
  assert.match(hub, /countryMetricCopy\.returningUsers/);
  assert.match(hub, /countryMetricCopy\.totalUsers/);
  assert.match(metricCopy, /ko:\s*\{\s*newUsers: '신규', returningUsers: '복귀', totalUsers: '총 유입'\s*\}/);
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
