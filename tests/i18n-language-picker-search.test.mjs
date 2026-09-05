import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const settingsSource = readFileSync(
  new URL('../src/components/AppSettings.tsx', import.meta.url),
  'utf8',
);
const headerPickerSource = readFileSync(
  new URL('../src/components/HeaderLanguagePickerPortal.tsx', import.meta.url),
  'utf8',
);
const languageSearchSource = readFileSync(
  new URL('../src/lib/i18n/languageSearch.ts', import.meta.url),
  'utf8',
);

test('localized language search stays client-local and preserves static fallbacks', () => {
  assert.match(languageSearchSource, /Intl\.DisplayNames/);
  assert.match(languageSearchSource, /option\.nativeName/);
  assert.match(languageSearchSource, /option\.englishName/);
  assert.match(languageSearchSource, /option\.locale/);
  assert.match(languageSearchSource, /localizedNames\[option\.locale\] \?\? ''/);
  assert.doesNotMatch(languageSearchSource, /fetch\(/);
});

test('settings search includes localized aliases without falsely rejecting the selected language', () => {
  assert.match(settingsSource, /buildLocalizedLanguageNames/);
  assert.match(settingsSource, /matchesLanguageSearch/);
  assert.match(settingsSource, /currentLanguageMatchesQuery/);
  assert.match(settingsSource, /!currentLanguageMatchesQuery/);
});

test('direct-invite picker has a non-autofocusing iPhone-safe search field', () => {
  assert.match(headerPickerSource, /getLanguagePickerCopy/);
  assert.match(headerPickerSource, /const \[languageQuery, setLanguageQuery\] = useState\(''\)/);
  assert.match(headerPickerSource, /placeholder=\{languageCopy\.searchPlaceholder\}/);
  assert.match(headerPickerSource, /aria-label=\{languageCopy\.searchPlaceholder\}/);
  assert.match(headerPickerSource, /type="search"/);
  assert.match(headerPickerSource, /font-size:1rem/);
  assert.doesNotMatch(headerPickerSource, /autoFocus/);
  assert.match(headerPickerSource, /setLanguageQuery\(''\)/);
});

test('direct-invite search keeps listbox keyboard navigation separate from the input', () => {
  assert.match(headerPickerSource, /className="headerLanguageOptionList"/);
  assert.match(headerPickerSource, /role="listbox"/);
  assert.match(headerPickerSource, /onKeyDown=\{handleMenuKeyDown\}/);
  assert.match(headerPickerSource, /className="headerLanguageNoResults" role="status"/);
});
