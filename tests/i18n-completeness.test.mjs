import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const localeSource = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const registrationSource = readFileSync(
  'src/lib/i18n/localePacks/registerExpandedLocales.ts',
  'utf8',
);
const appProvidersSource = readFileSync(
  'src/components/AppProviders.tsx',
  'utf8',
);
const legalPageSource = readFileSync(
  'src/components/LocalizedLegalPage.tsx',
  'utf8',
);
const documentSyncSource = readFileSync(
  'src/components/LocaleDocumentSync.tsx',
  'utf8',
);
const languageFlagSource = readFileSync(
  'src/components/LanguageFlag.tsx',
  'utf8',
);
const forecastSource = readFileSync(
  'src/components/PublicRewardForecastPortal.tsx',
  'utf8',
);
const typographySource = readFileSync(
  'src/app/localized-typography.css',
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

const CORE_LOCALES = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja', 'it', 'tr', 'nl', 'de', 'fr',
];
const supportedLocales = definitions.map(({ locale }) => locale);
const expandedLocales = supportedLocales.filter(
  (locale) => !CORE_LOCALES.includes(locale),
);
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

test('locale registry keeps every core locale and has no duplicates', () => {
  assert.equal(new Set(supportedLocales).size, supportedLocales.length);
  for (const locale of CORE_LOCALES) {
    assert.ok(
      supportedLocales.includes(locale),
      `core locale ${locale} was removed from the registry`,
    );
  }
  assert.ok(
    supportedLocales.length >= 17,
    'the reviewed 17-language baseline must not shrink',
  );
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

test('RTL handling is generic and Arabic is registered as RTL', () => {
  const arabic = definitions.find(({ locale }) => locale === 'ar');
  assert.equal(arabic?.direction, 'rtl');
  assert.match(
    documentSyncSource,
    /document\.documentElement\.dir\s*=\s*getLocaleDirection\(nextLocale\)/,
  );
  assert.match(typographySource, /html\[dir=['"]rtl['"]\]/);
  assert.match(typographySource, /direction:\s*ltr/);
});

test('every non-core locale has one complete typed locale pack and registration', () => {
  assert.ok(expandedLocales.length >= 6);

  for (const locale of expandedLocales) {
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

test('expanded locale packs preserve VeInvite protocol terminology', () => {
  for (const locale of expandedLocales) {
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

    assert.doesNotMatch(source, /\b(?:TODO|FIXME)\b/);
  }
});

test('expanded locales are registered before main app children render', () => {
  assert.match(
    appProvidersSource,
    /import ['"]@\/lib\/i18n\/localePacks\/registerExpandedLocales['"];?/,
  );
});

test('legal navigation copy covers every supported locale', () => {
  for (const locale of supportedLocales) {
    assert.match(
      legalPageSource,
      new RegExp(`\\n\\s{2}${locale}:\\s*['"]`),
      `legal back label is missing for ${locale}`,
    );
  }
});

test('standalone reward forecast copy covers every supported locale', () => {
  assert.match(
    forecastSource,
    /Record<SupportedLocale, ForecastCopy>/,
  );
  for (const locale of supportedLocales) {
    assert.match(
      forecastSource,
      new RegExp(`\\n\\s{2}${locale}:\\s*\\{`),
      `reward forecast copy is missing for ${locale}`,
    );
  }
});

test('new localization boundaries use SupportedLocale instead of the legacy string key type', () => {
  assert.match(localeSource, /@deprecated Legacy translation tables/);
  assert.match(documentSyncSource, /type SupportedLocale/);
  assert.match(legalPageSource, /Record<SupportedLocale, string>/);
  assert.match(languageFlagSource, /type SupportedLocale/);
  assert.match(forecastSource, /type SupportedLocale/);
});
