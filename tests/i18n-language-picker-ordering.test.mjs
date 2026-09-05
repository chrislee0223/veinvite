import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSettingsSource = readFileSync(
  new URL('../src/components/AppSettings.tsx', import.meta.url),
  'utf8',
);
const localesSource = readFileSync(
  new URL('../src/lib/i18n/locales.ts', import.meta.url),
  'utf8',
);
const languageSearchSource = readFileSync(
  new URL('../src/lib/i18n/languageSearch.ts', import.meta.url),
  'utf8',
);

test('every language option carries a native and English display name', () => {
  const definitionLines = localesSource
    .split('\n')
    .filter((line) => line.includes("{ locale: '"));

  assert.ok(definitionLines.length > 0);
  for (const line of definitionLines) {
    assert.match(line, /nativeName: '[^']+'/);
    assert.match(line, /englishName: '[^']+'/);
  }

  assert.match(
    localesSource,
    /nativeName: 'Ελληνικά', englishName: 'Greek'/,
  );
  assert.match(
    localesSource,
    /englishName: definition\.englishName/,
  );
});

test('language picker pins the selected language, then search, then sorted alternatives', () => {
  const selectedIndex = appSettingsSource.indexOf(
    'className="selectedLanguageBlock"',
  );
  const searchIndex = appSettingsSource.indexOf(
    'className="languageSearch"',
  );
  const listIndex = appSettingsSource.indexOf(
    'className="languageOptionList"',
  );

  assert.ok(selectedIndex >= 0);
  assert.ok(searchIndex > selectedIndex);
  assert.ok(listIndex > searchIndex);
  assert.match(
    appSettingsSource,
    /option\.locale !== currentLanguage\.locale/,
  );
  assert.match(
    appSettingsSource,
    /\.sort\(compareLanguageOptions\)/,
  );
  assert.match(
    appSettingsSource,
    /left\.nativeName\.localeCompare\(/,
  );
});

test('language search matches native name, English name, locale code, and optional localized aliases', () => {
  assert.match(appSettingsSource, /type="search"/);
  assert.match(appSettingsSource, /matchesLanguageSearch\(/);
  assert.match(
    languageSearchSource,
    /option\.nativeName,\s*option\.englishName,\s*option\.locale,\s*localizedNames\[option\.locale\] \?\? '',/s,
  );
  assert.match(
    languageSearchSource,
    /normalizeLanguageSearch\(value\)\.includes\(normalizedQuery\)/,
  );
  assert.match(appSettingsSource, /setLanguageQuery\(''\)/);
});

test('picker stays keyboard-safe and script-direction aware', () => {
  assert.match(
    appSettingsSource,
    /input:not\(\[disabled\]\)/,
  );
  assert.match(
    appSettingsSource,
    /dir=\{currentLanguage\.direction\}/,
  );
  assert.match(
    appSettingsSource,
    /dir=\{option\.direction\}/,
  );
});
