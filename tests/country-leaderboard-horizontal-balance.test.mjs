import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const css = readFileSync(
  join(root, 'src/app/leaderboard-country-horizontal-balance.css'),
  'utf8',
);
const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8');
const hub = readFileSync(
  join(root, 'src/components/PublicLeaderboardHub.tsx'),
  'utf8',
);
const locales = readFileSync(
  join(root, 'src/lib/i18n/locales.ts'),
  'utf8',
);
const metricCopy = readFileSync(
  join(root, 'src/lib/i18n/countryArrivalMetricCopy.ts'),
  'utf8',
);

test('country layout guard loads after the card-height guard', () => {
  const heightImport = layout.indexOf("import './leaderboard-card-height-stability.css';");
  const balanceImport = layout.indexOf("import './leaderboard-country-horizontal-balance.css';");
  assert.ok(heightImport >= 0);
  assert.ok(balanceImport > heightImport);
});

test('country ranking uses stable five-column geometry at all reviewed breakpoints', () => {
  assert.match(css, /grid-template-columns: 44px minmax\(0, 1fr\) 52px 52px 64px;/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*grid-template-columns: 32px minmax\(0, 1fr\) 40px 40px 46px;/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*grid-template-columns: 28px minmax\(0, 1fr\) 36px 36px 42px;/);
});

test('country stays at inline start instead of being optically centered with manual offsets', () => {
  assert.match(css, /\.countryHeader \.countryHeaderCountry \{[\s\S]*text-align: start;/);
  assert.match(css, /\.countryIdentity \{[\s\S]*justify-content: flex-start;[\s\S]*text-align: start;/);
  assert.doesNotMatch(css, /padding-inline-start:\s*(?:1[5-9]|[2-9]\d)px/);
  assert.doesNotMatch(css, /justify-content:\s*center[^;]*;\s*\n\s*text-align:\s*center/);
});

test('five-column rows render rank country new returning and total in semantic order', () => {
  const rankIndex = hub.indexOf('className="countryRank"');
  const countryIndex = hub.indexOf('className="countryIdentity"');
  const newIndex = hub.indexOf('className="countryMetricValue countryNew"');
  const returningIndex = hub.indexOf('className="countryMetricValue countryReturning"');
  const totalIndex = hub.indexOf('className="countryMetricValue countryTotal"');

  assert.ok(rankIndex >= 0);
  assert.ok(countryIndex > rankIndex);
  assert.ok(newIndex > countryIndex);
  assert.ok(returningIndex > newIndex);
  assert.ok(totalIndex > returningIndex);
});

test('metric copy is complete for every supported locale and includes RTL languages', () => {
  const localeMatches = [...locales.matchAll(/\{ locale: '([^']+)'/g)].map((match) => match[1]);
  assert.equal(localeMatches.length, 28);

  for (const locale of localeMatches) {
    const escaped = locale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(metricCopy, new RegExp(`(?:^|\\n)\\s*['\"]?${escaped}['\"]?:\\s*\\{`));
  }

  assert.match(metricCopy, /ar: \{ newUsers: 'جدد', returningUsers: 'عائدون', totalUsers: 'الإجمالي' \}/);
  assert.match(metricCopy, /ur: \{ newUsers: 'نئے', returningUsers: 'واپسی', totalUsers: 'کل' \}/);
  assert.match(metricCopy, /arz: \{ newUsers: 'جديد', returningUsers: 'راجعين', totalUsers: 'الإجمالي' \}/);
});

test('horizontal layout does not replace the separate card-height or scrolling geometry guards', () => {
  assert.doesNotMatch(css, /\.unifiedRankingCard\s*\{/);
  assert.doesNotMatch(css, /\.countryScroll\s*\{[^}]*height\s*:/s);
  assert.doesNotMatch(css, /\.countryRow[^}]*height\s*:/s);
});
