import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const hub = readFileSync(
  join(root, 'src/components/PublicLeaderboardHub.tsx'),
  'utf8',
);
const countryFlag = readFileSync(
  join(root, 'src/components/CountryFlag.tsx'),
  'utf8',
);
const countryCopy = readFileSync(
  join(root, 'src/lib/i18n/countryLeaderboardCopy.ts'),
  'utf8',
);
const layoutCss = readFileSync(
  join(root, 'src/app/leaderboard-country-horizontal-balance.css'),
  'utf8',
);

test('country ranking renders flags instead of country-code badges', () => {
  assert.match(hub, /<CountryFlag countryCode=\{row\.countryCode\} \/>/);
  assert.doesNotMatch(hub, /className="countryCode"/);
  assert.match(countryFlag, /LOCALE_DEFINITIONS/);
  assert.match(countryFlag, /definition\.flagSource/);
  assert.match(countryFlag, /String\.fromCodePoint/);
  assert.match(countryFlag, /object-fit:contain;/);
});

test('country header uses a short localized country label', () => {
  assert.match(hub, /countryCopy\.country/);
  assert.match(countryCopy, /country: string/);
  assert.match(countryCopy, /ko:\s*\{[\s\S]*country: '국가'/);
});

test('country rows use five columns with country at inline start and compact metrics', () => {
  assert.match(
    layoutCss,
    /grid-template-columns: 44px minmax\(0, 1fr\) 52px 52px 64px;/,
  );
  assert.match(
    layoutCss,
    /\.countryHeader \.countryHeaderCountry \{[\s\S]*text-align: start;/,
  );
  assert.match(
    layoutCss,
    /\.countryIdentity \{[\s\S]*justify-content: flex-start;[\s\S]*text-align: start;/,
  );
  assert.match(layoutCss, /\.countryMetricValue \{[\s\S]*direction: ltr;[\s\S]*unicode-bidi: isolate;/);
});

test('internal row separators stay removed while the active tab underline remains', () => {
  assert.match(
    hub,
    /\.rankingTabs \{[\s\S]*border-bottom:0;/,
  );
  assert.match(
    layoutCss,
    /\.countryHeader \{[\s\S]*border-bottom: 0;/,
  );
  assert.match(
    layoutCss,
    /\.countryRow,[\s\S]*\.countryPlaceholderRow \{[\s\S]*border-bottom: 0;/,
  );
  assert.match(
    hub,
    /\.inviterInside \.tableHeader \{[\s\S]*border-bottom:0 !important;/,
  );
  assert.match(
    hub,
    /\.inviterInside \.rankRow \{[\s\S]*border-bottom:0 !important;/,
  );
  assert.match(hub, /\.rankingTabs button\.active::after/);
});

test('top three country ranks receive restrained medal emphasis', () => {
  assert.match(hub, /data-rank=\{row\.rank <= 3 \? row\.rank : undefined\}/);
  assert.match(layoutCss, /\.countryRow\[data-rank='1'\] \.countryRank/);
  assert.match(layoutCss, /\.countryRow\[data-rank='2'\] \.countryRank/);
  assert.match(layoutCss, /\.countryRow\[data-rank='3'\] \.countryRank/);
});

test('total arrivals remain the strongest numeric emphasis', () => {
  assert.match(layoutCss, /\.countryReturning \{[\s\S]*color: #aaa49a;/);
  assert.match(layoutCss, /\.countryTotal \{[\s\S]*color: #ffd35c;[\s\S]*font-weight: 900;/);
});
