import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const typography = readFileSync('src/app/localized-typography.css', 'utf8');
const languageSelect = readFileSync(
  'src/components/LanguageSelectV2.tsx',
  'utf8',
);
const countryCopy = readFileSync(
  'src/lib/i18n/countryLeaderboardCopy.ts',
  'utf8',
);

test('primary navigation labels can wrap instead of being truncated', () => {
  assert.match(
    typography,
    /\.bottomNavigation button span,[\s\S]*?white-space:\s*normal\s*!important/,
  );
  assert.match(
    typography,
    /\.bottomNavigation button span,[\s\S]*?text-wrap:\s*balance/,
  );
  assert.match(
    typography,
    /\.rankingTabs button > span\s*\{[\s\S]*?white-space:\s*normal\s*!important/,
  );
  assert.match(
    typography,
    /\.rankingTabs button > span\s*\{[\s\S]*?text-wrap:\s*balance/,
  );
});

test('language selection respects each option native writing direction', () => {
  assert.match(languageSelect, /className="languageText" dir=\{option\.direction\}/);
  assert.match(languageSelect, /text-align:start/);
  assert.match(languageSelect, /unicode-bidi:isolate/);
  assert.match(languageSelect, /className="continueArrow"/);
  assert.match(
    typography,
    /html\[dir='rtl'\] \.screen \.continueArrow\s*\{[\s\S]*?scaleX\(-1\)/,
  );
});

test('RTL country leaderboard keeps numeric rank and totals LTR-isolated', () => {
  assert.match(
    typography,
    /html\[dir='rtl'\] :is\([\s\S]*?\.countryRank,[\s\S]*?\.countryTotal,[\s\S]*?\)\s*\{[\s\S]*?direction:\s*ltr/,
  );
  assert.match(typography, /unicode-bidi:\s*isolate/);
});

test('country leaderboard labels describe people rather than abstract traffic', () => {
  const deprecatedTrafficTerms = [
    "countryTab: 'Country arrivals'",
    "countryTab: '按国家流入'",
    "countryTab: '国別流入'",
    "countryTab: 'Masuk per negara'",
    "countryTab: 'Приток по странам'",
    "countryTab: 'Εισροές ανά χώρα'",
  ];

  for (const term of deprecatedTrafficTerms) {
    assert.ok(
      !countryCopy.includes(term),
      `country leaderboard kept traffic-like wording: ${term}`,
    );
  }

  for (const expected of [
    "countryTab: 'Users by country'",
    "countryTab: '국가별 유입 사용자'",
    "countryTab: '各国用户'",
    "countryTab: '国別ユーザー'",
    "countryTab: 'Pengguna per negara'",
    "countryTab: 'Người dùng theo quốc gia'",
    "countryTab: 'Пользователи по странам'",
    "countryTab: 'Χρήστες ανά χώρα'",
  ]) {
    assert.ok(countryCopy.includes(expected), `missing reviewed wording: ${expected}`);
  }
});
