import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const registrationSource = readFileSync(
  'src/lib/i18n/localePacks/registerExpandedLocales.ts',
  'utf8',
);
const privacySource = readFileSync(
  'src/lib/i18n/localePacks/czechStandalonePrivacy.ts',
  'utf8',
);
const localeSource = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const typographySource = readFileSync(
  'src/app/localized-typography.css',
  'utf8',
);

const recentCzechSurfaces = [
  'src/lib/i18n/countryArrivalMetricCopy.ts',
  'src/lib/i18n/countryLeaderboardCopy.ts',
  'src/lib/i18n/leaderboardMovementCopy.ts',
  'src/lib/i18n/networkCanaryInteractionCopy.ts',
  'src/lib/i18n/networkCanaryUiCopy.ts',
  'src/lib/i18n/networkCanvasControlCopy.ts',
  'src/lib/i18n/networkCopy.ts',
  'src/lib/i18n/networkExperienceCopy.ts',
  'src/lib/i18n/networkExploreCopy.ts',
  'src/lib/i18n/networkHubCopy.ts',
  'src/lib/i18n/networkNativeReview.ts',
  'src/lib/i18n/networkNaturalnessPolish.ts',
  'src/lib/i18n/privacyCountryObservationCopy.ts',
  'src/lib/i18n/privacySecurityClientCopy.ts',
];

test('Czech standalone privacy copy is registered before the app renders', () => {
  assert.match(
    registrationSource,
    /import \{ registerCzechStandalonePrivacyCopy \} from '\.\/czechStandalonePrivacy';/,
  );
  assert.match(registrationSource, /registerCzechStandalonePrivacyCopy\(\);/);

  for (const assignment of [
    'PRIVACY_USAGE_ANALYTICS_COPY.cs',
    'PRIVACY_PRODUCT_ANALYTICS_COPY.cs',
    'PRIVACY_WALLET_LANGUAGE_COPY.cs',
    'PRIVACY_USAGE_ANALYTICS_CONTROL_COPY.cs',
  ]) {
    assert.ok(
      privacySource.includes(assignment),
      `missing Czech standalone privacy registration: ${assignment}`,
    );
  }
});

test('Czech privacy copy is deliberate, natural, and not an English fallback', () => {
  for (const phrase of [
    'Anonymní statistiky používání',
    'Anonymní statistiky interakcí s aplikací',
    'Nastavení jazyka peněženky',
    'Tuto možnost lze kdykoli vypnout.',
  ]) {
    assert.ok(privacySource.includes(phrase), `missing reviewed Czech phrase: ${phrase}`);
  }

  for (const englishFallback of [
    'Anonymous usage analytics',
    'Anonymous product interaction analytics',
    'Wallet language settings',
    'You can turn this off at any time.',
  ]) {
    assert.ok(
      !privacySource.includes(englishFallback),
      `Czech privacy copy still contains English fallback: ${englishFallback}`,
    );
  }

  assert.doesNotMatch(privacySource, /\b(?:TODO|FIXME)\b/);
  assert.doesNotMatch(privacySource, /[ \t]+\n/);
});

test('recent Czech feature surfaces remain localized after the latest app upgrades', () => {
  for (const path of recentCzechSurfaces) {
    const source = readFileSync(path, 'utf8');
    assert.match(
      source,
      /\n\s*(?:cs|'cs'):\s*\{/,
      `${path} lost its Czech copy`,
    );
  }
});

test('Czech uses the shared Latin layout safeguards for spacing and long copy', () => {
  assert.match(
    localeSource,
    /locale:\s*'cs'[\s\S]*?direction:\s*'ltr'[\s\S]*?typography:\s*'latin'/,
  );
  assert.match(typographySource, /\.legalPage/);
  assert.match(typographySource, /min-width:\s*0/);
  assert.match(typographySource, /text-wrap:\s*balance/);
  assert.match(typographySource, /text-wrap:\s*pretty/);
  assert.match(typographySource, /overflow-wrap:\s*normal/);
  assert.match(typographySource, /height:\s*auto/);
});
