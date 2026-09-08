import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const typography = readFileSync('src/app/localized-typography.css', 'utf8');
const settingsDirection = readFileSync(
  'src/app/settings-language-direction.css',
  'utf8',
);
const layout = readFileSync('src/app/layout.tsx', 'utf8');
const languageSelect = readFileSync(
  'src/components/LanguageSelectV2.tsx',
  'utf8',
);
const countryCopy = readFileSync(
  'src/lib/i18n/countryLeaderboardCopy.ts',
  'utf8',
);
const networkCopy = readFileSync(
  'src/lib/i18n/networkCopy.ts',
  'utf8',
);

test('primary navigation labels wrap while icon geometry is explicitly restored', () => {
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
    /\.bottomNavigation button \.navIcon \{[\s\S]*?width:\s*21px\s*!important;[\s\S]*?height:\s*21px\s*!important;[\s\S]*?display:\s*block\s*!important;[\s\S]*?white-space:\s*nowrap\s*!important;[\s\S]*?line-height:\s*0\s*!important/,
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

test('country translation wrapping does not reintroduce obsolete row heights', () => {
  assert.doesNotMatch(typography, /height:\s*320px\s*!important/);
  assert.doesNotMatch(typography, /height:\s*64px\s*!important/);
  assert.match(
    typography,
    /row heights themselves are owned by the unified[\s\S]*50px desktop \/ 46px mobile \/ 44px narrow mobile/,
  );
});

test('Taiwan network wording uses natural Taiwan terminology', () => {
  assert.match(networkCopy, /'zh-tw': \{[\s\S]*navLabel: '網路'/);
  assert.match(networkCopy, /'zh-tw': \{[\s\S]*title: '網路功能即將推出'/);
  assert.match(networkCopy, /'zh-tw': \{[\s\S]*VeInvite 網路/);
  assert.doesNotMatch(networkCopy, /'zh-tw': \{[\s\S]*網絡/);
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

test('Settings language picker aligns native names using their own direction', () => {
  assert.match(layout, /import '\.\/settings-language-direction\.css';/);
  assert.match(
    settingsDirection,
    /\.settingsPage :is\([\s\S]*?\.languagePickerCopy,[\s\S]*?\.languageOptionCopy[\s\S]*?\) strong\[dir\][\s\S]*?text-align:\s*start\s*!important/,
  );
  assert.match(settingsDirection, /unicode-bidi:\s*isolate/);
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
