import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [walletLanguageCopy, legalPage, usageAnalyticsDoc] = await Promise.all([
  read('src/lib/i18n/privacyWalletLanguageCopy.ts'),
  read('src/components/LocalizedLegalPage.tsx'),
  read('docs/USAGE_ANALYTICS_KO.md'),
]);

const LOCALES = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja', 'it',
  'tr', 'nl', 'de', 'fr', 'ar', 'bn', 'pt',
  'ru', 'id', 'vi', 'zh-tw', 'sv', 'ro', 'ur',
  'pcm', 'arz', 'mr', 'te', 'sw', 'ha',
];

test('wallet-language privacy disclosure covers every supported locale', () => {
  for (const locale of LOCALES) {
    const marker = locale === 'zh-tw'
      ? "  'zh-tw': {"
      : `  ${locale}: {`;

    assert.ok(
      walletLanguageCopy.includes(marker),
      `missing wallet-language privacy copy for ${locale}`,
    );
  }

  assert.match(walletLanguageCopy, /Record<\s*Locale,/);
  assert.match(walletLanguageCopy, /browser detection/i);
  assert.match(walletLanguageCopy, /browser-local storage/i);
  assert.match(walletLanguageCopy, /explicit selection/i);
  assert.match(walletLanguageCopy, /separately from anonymous usage analytics/i);
  assert.match(walletLanguageCopy, /not treated as a user’s country or nationality/i);
});

test('privacy page renders wallet-language disclosure separately from anonymous analytics', () => {
  assert.match(legalPage, /PRIVACY_WALLET_LANGUAGE_COPY/);
  assert.match(legalPage, /walletLanguageCopy/);
  assert.match(legalPage, /key="wallet-language-privacy"/);
  assert.match(legalPage, /walletLanguageCopy\?\.updated/);
  assert.match(legalPage, /PRIVACY_USAGE_ANALYTICS_COPY/);
});

test('operator-facing usage documentation distinguishes display locale from country and wallet preference', () => {
  assert.match(usageAnalyticsDoc, /현재 표시 언어/);
  assert.match(usageAnalyticsDoc, /국가나 국적/);
  assert.match(usageAnalyticsDoc, /익명 이용 분석/);
  assert.match(usageAnalyticsDoc, /지갑별 언어/);
});
