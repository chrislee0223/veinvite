import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const localeSource = fs.readFileSync('src/lib/i18n/locales.ts', 'utf8');
const privacySource = fs.readFileSync(
  'src/lib/i18n/privacyCountryObservationCopy.ts',
  'utf8',
);
const legalPageSource = fs.readFileSync(
  'src/components/LocalizedLegalPage.tsx',
  'utf8',
);

const localePattern = /locale:\s*'([^']+)'/g;
const supportedLocales = [...localeSource.matchAll(localePattern)].map(
  (match) => match[1],
);

function keyPattern(locale) {
  const escaped = locale.replaceAll('-', '\\-');
  return new RegExp(`\\n\\s{2}(?:${escaped}|['\"]${escaped}['\"]):\\s*\\{`);
}

test('coarse-country privacy copy covers every supported locale', () => {
  assert.match(
    privacySource,
    /Record<\s*SupportedLocale,\s*PrivacyCountryObservationCopy\s*>/,
  );
  for (const locale of supportedLocales) {
    assert.match(
      privacySource,
      keyPattern(locale),
      `country privacy copy is missing for ${locale}`,
    );
  }
});

test('country privacy disclosure states the non-invasive data boundary', () => {
  assert.match(privacySource, /does not infer country from the selected app language/i);
  assert.match(privacySource, /does not store raw IP addresses/i);
  assert.match(privacySource, /does not publish wallet-to-country mappings/i);
  assert.match(privacySource, /not treated as nationality or precise location/i);
});

test('privacy page renders the country observation section and latest update date', () => {
  assert.match(
    legalPageSource,
    /PRIVACY_COUNTRY_OBSERVATION_COPY\[locale\]/,
  );
  assert.match(legalPageSource, /country-observation-privacy/);
  assert.match(
    legalPageSource,
    /countryObservationCopy\?\.updated\s*\?\?/,
  );
});
