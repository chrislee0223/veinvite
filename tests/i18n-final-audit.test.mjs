import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const locales = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const network = readFileSync('src/lib/i18n/networkCopy.ts', 'utf8');
const country = readFileSync('src/lib/i18n/countryLeaderboardCopy.ts', 'utf8');
const metrics = readFileSync('src/lib/i18n/countryArrivalMetricCopy.ts', 'utf8');
const typography = readFileSync('src/app/localized-typography.css', 'utf8');
const bottomNav = readFileSync('src/components/AppBottomNavigation.tsx', 'utf8');

const REVIEWED_28_LOCALES = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja', 'it', 'tr', 'nl', 'de', 'fr',
  'ar', 'bn', 'pt', 'ru', 'id', 'vi', 'zh-tw', 'sv', 'ro', 'ur', 'pcm',
  'arz', 'mr', 'te', 'sw', 'ha', 'el',
];

test('all 28 reviewed locales remain registered explicitly', () => {
  for (const locale of REVIEWED_28_LOCALES) {
    const quoted = locale.includes('-') ? `'${locale}'` : `locale: '${locale}'`;
    assert.ok(
      locale.includes('-')
        ? locales.includes(`locale: ${quoted}`)
        : locales.includes(quoted),
      `missing reviewed locale ${locale}`,
    );
  }
  assert.equal(new Set(REVIEWED_28_LOCALES).size, 28);
});

test('high-risk navigation and country tables remain exhaustive for all reviewed locales', () => {
  for (const locale of REVIEWED_28_LOCALES) {
    const key = locale.includes('-') ? `'${locale}':` : `${locale}:`;
    assert.ok(network.includes(key), `network copy missing ${locale}`);
    assert.ok(country.includes(key), `country leaderboard copy missing ${locale}`);
    assert.ok(metrics.includes(key), `country metric copy missing ${locale}`);
  }
});

test('multilingual bottom navigation keeps icons fixed and reserves two label lines', () => {
  assert.match(bottomNav, /grid-template-rows: 21px 24px/);
  assert.match(bottomNav, /\.navIcon \{ width: 21px; height: 21px; min-height: 21px;/);
  assert.match(bottomNav, /\.navLabel \{[^}]*height: 24px;[^}]*white-space: normal;[^}]*text-wrap: balance;/);
  assert.match(typography, /\.bottomNavigation button span,/);
  assert.match(
    typography,
    /\.bottomNavigation button \.navIcon \{[\s\S]*?width:\s*21px\s*!important;[\s\S]*?height:\s*21px\s*!important;[\s\S]*?display:\s*block\s*!important;[\s\S]*?line-height:\s*0\s*!important/,
  );
});

test('translation wrapping cannot override the shared leaderboard row geometry', () => {
  assert.doesNotMatch(typography, /height:\s*320px\s*!important/);
  assert.doesNotMatch(typography, /height:\s*64px\s*!important/);
});

test('Taiwan Traditional Chinese uses Taiwan network terminology', () => {
  const taiwan = network.match(/'zh-tw': \{[\s\S]*?\n  \},/)?.[0] ?? '';
  assert.match(taiwan, /navLabel: '網路'/);
  assert.match(taiwan, /title: '網路功能即將推出'/);
  assert.match(taiwan, /VeInvite 網路/);
  assert.doesNotMatch(taiwan, /網絡/);
});
