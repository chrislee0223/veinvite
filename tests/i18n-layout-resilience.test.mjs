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
const networkPage = readFileSync(
  'src/components/AppNetworkComingSoon.tsx',
  'utf8',
);
const networkCopy = readFileSync(
  'src/lib/i18n/networkCopy.ts',
  'utf8',
);
const rewardForecastCopy = readFileSync(
  'src/lib/i18n/rewardForecastCopy.ts',
  'utf8',
);
const notificationV2Copy = readFileSync(
  'src/lib/i18n/notificationV2Copy.ts',
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

test('network coming-soon copy never breaks translated words arbitrarily', () => {
  assert.doesNotMatch(networkPage, /overflow-wrap:\s*anywhere/);
  assert.match(networkPage, /white-space:normal/);
  assert.match(networkPage, /word-break:normal/);
  assert.match(networkPage, /word-break:keep-all/);
  assert.match(networkPage, /data-locale-typography='arabic'/);
  assert.match(networkPage, /data-locale-typography='indic'/);
  assert.match(networkPage, /lang=\{supportedLocale\}/);
  assert.match(networkPage, /dir=\{getLocaleDirection\(supportedLocale\)\}/);
});

test('recent compact copy avoids reviewed literal or mixed-language phrasing', () => {
  for (const deprecated of [
    'متوقع انعام allocation اور شرکت',
    'Allocation आणि participation',
    'Allocation మరియు participation',
    'kulingana na allocation na ushiriki',
    'KIMANTA INVITE REWARD',
    'Η εκτίμηση ανταμοιβής δεν είναι προσωρινά διαθέσιμη',
  ]) {
    assert.ok(
      !rewardForecastCopy.includes(deprecated),
      `reward forecast kept awkward wording: ${deprecated}`,
    );
  }

  for (const expected of [
    'متوقع انعام مختص رقم اور شرکت',
    'वाटप आणि सहभागानुसार',
    'కేటాయింపు మరియు పాల్గొనడాన్ని బట్టి',
    'kulingana na mgawanyo na ushiriki',
    'KIMANTA LADAN GAYYATA',
    'Η εκτίμηση ανταμοιβής είναι προσωρινά μη διαθέσιμη',
  ]) {
    assert.ok(
      rewardForecastCopy.includes(expected),
      `reward forecast is missing reviewed wording: ${expected}`,
    );
  }
});

test('network and recent notification copy keeps the reviewed natural phrasing', () => {
  for (const expected of [
    'la red de VeInvite que se expande a partir de ellos',
    'la rete VeInvite che si sviluppa a partire da loro',
    'Ağın çok yakında hazır olacak',
    "navLabel: '網路'",
    "status: 'HIVI KARIBUNI'",
    "status: 'BA DA JIMAWA BA'",
  ]) {
    assert.ok(networkCopy.includes(expected), `missing network wording: ${expected}`);
  }

  for (const expected of [
    'Tiến độ của bạn bè đã được cập nhật',
    'Xác minh cuối cùng đã được thông qua',
    'den tillhörande B3TR-belöningen',
    'Verificarea finală a fost finalizată cu succes',
    'Ο τελικός έλεγχος ολοκληρώθηκε με επιτυχία',
  ]) {
    assert.ok(
      notificationV2Copy.includes(expected),
      `missing notification wording: ${expected}`,
    );
  }
});
