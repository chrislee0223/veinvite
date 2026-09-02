import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const localeSource = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const registrationSource = readFileSync(
  'src/lib/i18n/localePacks/registerExpandedLocales.ts',
  'utf8',
);

const definitions = [
  ...localeSource.matchAll(
    /locale:\s*'([a-z]{2})'.*?flagSource:\s*'([^']+)'.*?direction:\s*'(ltr|rtl)'/g,
  ),
].map((match) => ({
  locale: match[1],
  flagSource: match[2],
  direction: match[3],
}));

const EXPECTED_LOCALES = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja', 'it', 'tr', 'nl', 'de', 'fr',
  'ar', 'bn', 'pt', 'ru', 'id', 'vi',
];
const EXPANDED_LOCALES = ['ar', 'bn', 'pt', 'ru', 'id', 'vi'];
const REQUIRED_PACK_SECTIONS = [
  'entryRejection',
  'guide',
  'guideEligibility',
  'guideFlow',
  'guideMissionStep',
  'guideRewardStep',
  'home',
  'inviteLanding',
  'invitee',
  'languageSelect',
  'leaderboard',
  'legalConsent',
  'legal',
  'nav',
  'notification',
  'rewardReceipt',
  'settings',
  'walletSession',
];

test('locale registry contains the complete supported locale set exactly once', () => {
  assert.deepEqual(
    definitions.map(({ locale }) => locale),
    EXPECTED_LOCALES,
  );
  assert.equal(new Set(EXPECTED_LOCALES).size, EXPECTED_LOCALES.length);
});

test('every registered locale points to an app-owned flag asset', () => {
  for (const definition of definitions) {
    assert.ok(definition.flagSource.startsWith('/flags/'));
    assert.ok(
      existsSync(`public${definition.flagSource}`),
      `${definition.locale} is missing ${definition.flagSource}`,
    );
  }
});

test('Arabic is the only current RTL locale', () => {
  const rtlLocales = definitions
    .filter(({ direction }) => direction === 'rtl')
    .map(({ locale }) => locale);
  assert.deepEqual(rtlLocales, ['ar']);
});

test('every expansion locale has one complete typed locale pack and registration', () => {
  for (const locale of EXPANDED_LOCALES) {
    const path = `src/lib/i18n/localePacks/${locale}.ts`;
    assert.ok(existsSync(path), `${locale} locale pack is missing`);

    const source = readFileSync(path, 'utf8');
    assert.match(source, /LocalePack\s*=\s*\{/);

    for (const section of REQUIRED_PACK_SECTIONS) {
      assert.match(
        source,
        new RegExp(`\\n\\s{2}${section}:\\s*\\{`),
        `${locale} locale pack is missing the ${section} section`,
      );
    }

    assert.ok(
      registrationSource.includes(`registerLocalePack('${locale}'`),
      `${locale} locale pack is not registered`,
    );
  }
});

test('new locale packs preserve VeInvite protocol terminology', () => {
  for (const locale of EXPANDED_LOCALES) {
    const source = readFileSync(
      `src/lib/i18n/localePacks/${locale}.ts`,
      'utf8',
    );

    for (const term of [
      'VeInvite',
      'VeBetterDAO',
      'B3TR',
      'VOT3',
      'Allocation Voting',
      'VeChain Explorer',
    ]) {
      assert.ok(
        source.includes(term),
        `${locale} locale pack lost required product term: ${term}`,
      );
    }
  }
});
