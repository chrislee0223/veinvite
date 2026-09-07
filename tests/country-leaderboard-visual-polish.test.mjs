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

test('country columns align as rank, flexible country identity, and arrival count', () => {
  assert.match(
    hub,
    /grid-template-columns:64px minmax\(0,1fr\) 84px;/,
  );
  assert.match(
    hub,
    /\.countryHeader span:nth-child\(2\) \{[\s\S]*text-align:start;/,
  );
  assert.match(
    hub,
    /\.countryIdentity \{[\s\S]*justify-content:flex-start;[\s\S]*text-align:start;/,
  );
  assert.match(hub, /scrollbar-gutter:auto;/);
});

test('internal row separators stay removed while the active tab underline remains', () => {
  assert.match(
    hub,
    /\.rankingTabs \{[\s\S]*border-bottom:0;/,
  );
  assert.match(
    hub,
    /\.countryHeader \{[\s\S]*border-bottom:0;/,
  );
  assert.match(
    hub,
    /\.countryRow,[\s\S]*\.countryPlaceholderRow \{[\s\S]*border-bottom:0;/,
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
  assert.match(hub, /\.countryRow\[data-rank='1'\] \.countryRank/);
  assert.match(hub, /\.countryRow\[data-rank='2'\] \.countryRank/);
  assert.match(hub, /\.countryRow\[data-rank='3'\] \.countryRank/);
});
