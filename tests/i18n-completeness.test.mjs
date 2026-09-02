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
const legalNavigationSource = readFileSync(
  'src/lib/i18n/legalNavigationCopy.ts',
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
const forecastComponentSource = readFileSync(
  'src/components/PublicRewardForecastPortal.tsx',
  'utf8',
);
const forecastCopySource = readFileSync(
  'src/lib/i18n/rewardForecastCopy.ts',
  'utf8',
);
const typographySource = readFileSync(
  'src/app/localized-typography.css',
  'utf8',
);
const languageRouteSource = readFileSync(
  'src/app/api/preferences/language/route.ts',
  'utf8',
);
const languageConstraintMigrationSource = readFileSync(
  'supabase/migrations/20260902074759_future_proof_wallet_language_constraint.sql',
  'utf8',
);

const LOCALE_TAG_PATTERN = '[a-z]{2,3}(?:-[a-z0-9]{2,8})*';
const definitions = [
  ...localeSource.matchAll(
    new RegExp(
      `locale:\\s*'(${LOCALE_TAG_PATTERN})'.*?flagSource:\\s*'([^']+)'.*?direction:\\s*'(ltr|rtl)'.*?typography:\\s*'(latin|cjk|arabic|indic)'`,
      'g',
    ),
  ),
].map((match) => ({
  locale: match[1],
  flagSource: match[2],
  direction: match[3],
  typography: match[4],
}));

const CORE_LOCALES = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja', 'it', 'tr', 'nl', 'de', 'fr',
];
const REVIEWED_27_LOCALES = [
  ...CORE_LOCALES,
  'ar', 'bn', 'pt', 'ru', 'id', 'vi',
  'zh-tw', 'sv', 'ro', 'ur', 'pcm', 'arz', 'mr', 'te', 'sw', 'ha',
];
const NEW_27_EXPANSION = [
  'zh-tw', 'sv', 'ro', 'ur', 'pcm', 'arz', 'mr', 'te', 'sw', 'ha',
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

const INTENTIONAL_SECTION_INHERITANCE = {
  arz: new Set(['legalConsent', 'legal', 'walletSession']),
};

// Some reviewed localizations use their native decimal digits in prose.
// Treat the different written forms of the number twelve as the same policy
// marker rather than forcing a Latin "12" into otherwise natural copy.
const ROUND_TWELVE_MARKERS = [
  '12',
  '১২', // Bengali
  '१२', // Devanagari
  '۱۲', // Persian/Urdu digits
  '١٢', // Arabic-Indic
  '౧౨', // Telugu
];

function objectKeyPattern(locale, suffix) {
  const escaped = locale.replaceAll('-', '\\-');
  return new RegExp(
    `\\n\\s{2}(?:${escaped}|['\"]${escaped}['\"]):\\s*${suffix}`,
  );
}

function localeDefinition(locale) {
  return definitions.find((definition) => definition.locale === locale);
}

test('locale registry keeps the reviewed 27-language baseline with no duplicates', () => {
  assert.equal(new Set(supportedLocales).size, supportedLocales.length);
  for (const locale of REVIEWED_27_LOCALES) {
    assert.ok(
      supportedLocales.includes(locale),
      `reviewed locale ${locale} is missing from the registry`,
    );
  }
  assert.ok(
    supportedLocales.length >= 27,
    'the reviewed 27-language baseline must not shrink',
  );
});

test('browser language detection prefers exact regional tags before base fallback', () => {
  const exactMatchIndex = localeSource.indexOf('if (isLocale(normalized))');
  const baseFallbackIndex = localeSource.indexOf("const base = normalized.split('-')[0]");

  assert.ok(exactMatchIndex >= 0, 'exact locale-tag matching is missing');
  assert.ok(
    baseFallbackIndex > exactMatchIndex,
    'base-language fallback must run only after exact locale-tag matching',
  );
  assert.ok(
    supportedLocales.includes('zh-tw'),
    'Taiwan Traditional Chinese must be an exact supported browser locale',
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

test('same-country language choices remain distinct while safely sharing flags', () => {
  assert.equal(localeDefinition('hi')?.flagSource, '/flags/in.svg');
  assert.equal(localeDefinition('mr')?.flagSource, '/flags/in.svg');
  assert.equal(localeDefinition('te')?.flagSource, '/flags/in.svg');
  assert.equal(localeDefinition('pcm')?.flagSource, '/flags/ng.svg');
  assert.equal(localeDefinition('ha')?.flagSource, '/flags/ng.svg');
});

test('RTL and script typography metadata cover every new script family', () => {
  for (const locale of ['ar', 'ur', 'arz']) {
    assert.equal(localeDefinition(locale)?.direction, 'rtl');
    assert.equal(localeDefinition(locale)?.typography, 'arabic');
  }
  for (const locale of ['hi', 'bn', 'mr', 'te']) {
    assert.equal(localeDefinition(locale)?.direction, 'ltr');
    assert.equal(localeDefinition(locale)?.typography, 'indic');
  }
  for (const locale of ['zh', 'zh-tw', 'ja', 'ko']) {
    assert.equal(localeDefinition(locale)?.typography, 'cjk');
  }

  assert.match(
    documentSyncSource,
    /document\.documentElement\.dir\s*=\s*getLocaleDirection\(nextLocale\)/,
  );
  assert.match(
    documentSyncSource,
    /dataset\.localeTypography\s*=\s*\n?\s*getLocaleTypography\(nextLocale\)/,
  );
  assert.match(typographySource, /html\[dir=['"]rtl['"]\]/);
  assert.match(
    typographySource,
    /data-locale-typography=['"]arabic['"]/,
  );
  assert.match(
    typographySource,
    /data-locale-typography=['"]indic['"]/,
  );
  assert.match(typographySource, /lang=['"]zh-tw['"]/);
  assert.match(typographySource, /lang=['"]ur['"]/);
  assert.match(typographySource, /direction:\s*ltr/);
  assert.match(typographySource, /unicode-bidi:\s*isolate/);
});

test('every non-core locale has a typed pack and is registered', () => {
  assert.ok(expandedLocales.length >= 16);

  for (const locale of expandedLocales) {
    const path = `src/lib/i18n/localePacks/${locale}.ts`;
    assert.ok(existsSync(path), `${locale} locale pack is missing`);

    const source = readFileSync(path, 'utf8');
    assert.match(source, /LocalePack\s*=\s*\{/);

    for (const section of REQUIRED_PACK_SECTIONS) {
      const hasLiteralSection = new RegExp(
        `\\n\\s{2}${section}:\\s*\\{`,
      ).test(source);
      const inherited =
        INTENTIONAL_SECTION_INHERITANCE[locale]?.has(section) ?? false;
      assert.ok(
        hasLiteralSection || inherited,
        `${locale} locale pack is missing the ${section} section`,
      );
    }

    assert.ok(
      registrationSource.includes(`registerLocalePack('${locale}'`),
      `${locale} locale pack is not registered`,
    );
  }
});

test('expanded locale packs preserve VeInvite protocol terminology and mission semantics', () => {
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

    assert.ok(
      ROUND_TWELVE_MARKERS.some((marker) => source.includes(marker)),
      `${locale} locale pack lost the reviewed 12-completed-round returning-user rule`,
    );
    assert.doesNotMatch(source, /\b(?:TODO|FIXME)\b/);
  }
});

test('Taiwan pack uses reviewed Traditional Chinese product wording, not Simplified leakage', () => {
  const source = readFileSync(
    'src/lib/i18n/localePacks/zh-tw.ts',
    'utf8',
  );
  assert.match(source, /繁體中文（台灣）/);
  assert.match(source, /使用者/);
  assert.match(source, /錢包/);
  assert.match(source, /隱私權政策/);
  assert.doesNotMatch(source, /钱包|用户|奖励|邀请|隐私政策/);
});

test('RTL localized UI avoids bidi-ambiguous mission arrows in the new Urdu and Egyptian packs', () => {
  for (const locale of ['ur', 'arz']) {
    const source = readFileSync(
      `src/lib/i18n/localePacks/${locale}.ts`,
      'utf8',
    );
    assert.doesNotMatch(
      source,
      /B3TR\s*→\s*VOT3/,
      `${locale} should describe token conversion in words instead of a bidi-sensitive arrow`,
    );
  }
});

test('regional-register reuse is explicit rather than accidental untranslated fallback', () => {
  const egyptian = readFileSync(
    'src/lib/i18n/localePacks/arz.ts',
    'utf8',
  );
  const pidgin = readFileSync(
    'src/lib/i18n/localePacks/pcm.ts',
    'utf8',
  );
  assert.match(egyptian, /Formal legal, consent, and wallet-security copy intentionally stays in MSA/);
  assert.match(
    pidgin,
    /Formal legal, consent,[\s\S]*wallet-security text intentionally stays in clear English/,
  );
  assert.match(pidgin, /deliberate locale choice, not a missing translation/);
});

test('expanded locales are registered before main app children render', () => {
  assert.match(
    appProvidersSource,
    /import ['"]@\/lib\/i18n\/localePacks\/registerExpandedLocales['"];?/,
  );
});

test('legal navigation copy is centralized and exhaustive for supported locales', () => {
  assert.match(
    legalNavigationSource,
    /Record<SupportedLocale, string>/,
  );
  for (const locale of supportedLocales) {
    assert.match(
      legalNavigationSource,
      objectKeyPattern(locale, `['\"]`),
      `legal back label is missing for ${locale}`,
    );
  }
  assert.match(legalPageSource, /LEGAL_BACK_LABEL\[locale\]/);
  assert.doesNotMatch(legalPageSource, /const BACK_LABEL/);
});

test('standalone reward forecast copy is centralized and exhaustive for supported locales', () => {
  assert.match(
    forecastCopySource,
    /Record<\s*SupportedLocale,\s*RewardForecastCopy\s*>/,
  );
  for (const locale of supportedLocales) {
    assert.match(
      forecastCopySource,
      objectKeyPattern(locale, '\\{'),
      `reward forecast copy is missing for ${locale}`,
    );
  }
  assert.match(
    forecastComponentSource,
    /REWARD_FORECAST_COPY\[(?:resolvedLocale|locale)\]/,
  );
  assert.doesNotMatch(forecastComponentSource, /const COPY:/);
});

test('multilingual layout safeguards protect long text and script metrics', () => {
  assert.match(typographySource, /min-width:\s*0/);
  assert.match(typographySource, /text-wrap:\s*balance/);
  assert.match(typographySource, /text-wrap:\s*pretty/);
  assert.match(typographySource, /overflow-wrap:\s*normal/);
  assert.match(typographySource, /word-break:\s*keep-all/);
  assert.match(typographySource, /Noto Nastaliq Urdu/);
  assert.match(typographySource, /Noto Sans Devanagari/);
  assert.match(typographySource, /Noto Sans Telugu/);
});

test('wallet language persistence stays future-proof and registry-gated', () => {
  assert.match(languageRouteSource, /isLocale\(language\)/);
  assert.match(
    languageConstraintMigrationSource,
    /char_length\(language\)\s*<=\s*35/i,
  );
  assert.match(
    languageConstraintMigrationSource,
    /\^\[a-z\]\{2,3\}\(-\[a-z0-9\]\{2,8\}\)\*\$/,
  );
  assert.doesNotMatch(
    languageConstraintMigrationSource,
    /language\s+in\s*\(/i,
  );
});

test('new localization boundaries use SupportedLocale instead of the legacy string key type', () => {
  assert.match(localeSource, /@deprecated Legacy translation tables/);
  assert.match(documentSyncSource, /type SupportedLocale/);
  assert.match(legalNavigationSource, /type \{ SupportedLocale \}/);
  assert.match(languageFlagSource, /type SupportedLocale/);
  assert.match(forecastCopySource, /type \{ SupportedLocale \}/);
});

test('the ten new expansion locales are all covered by the quality gate', () => {
  assert.deepEqual(
    NEW_27_EXPANSION.filter((locale) => !supportedLocales.includes(locale)),
    [],
  );
});
