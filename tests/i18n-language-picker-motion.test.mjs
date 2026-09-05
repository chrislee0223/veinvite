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
const pickerCopySource = readFileSync(
  new URL('../src/lib/i18n/languagePickerCopy.ts', import.meta.url),
  'utf8',
);
const localesSource = readFileSync(
  new URL('../src/lib/i18n/locales.ts', import.meta.url),
  'utf8',
);

test('settings language picker keeps exit lifecycle mounted until animation completion', () => {
  assert.match(settingsSource, /languageClosing/);
  assert.match(settingsSource, /finalizeLanguagePickerClose/);
  assert.match(settingsSource, /onAnimationEnd=/);
  assert.match(settingsSource, /LANGUAGE_CLOSE_FALLBACK_MS/);
  assert.match(settingsSource, /prefers-reduced-motion: reduce/);
  assert.match(settingsSource, /pendingLanguageRef/);

  const finalizeIndex = settingsSource.indexOf('const finalizeLanguagePickerClose');
  const queryResetIndex = settingsSource.indexOf("setLanguageQuery('')", finalizeIndex);
  const localeApplyIndex = settingsSource.indexOf('onLocaleChange(nextLocale)', finalizeIndex);
  assert.ok(finalizeIndex >= 0);
  assert.ok(queryResetIndex > finalizeIndex);
  assert.ok(localeApplyIndex > finalizeIndex);
});

test('settings search stays iPhone zoom safe, descriptive, and handles empty results', () => {
  assert.match(settingsSource, /font-size:16px/);
  assert.match(settingsSource, /placeholder=\{pickerCopy\.search\}/);
  assert.match(settingsSource, /aria-label=\{pickerCopy\.search\}/);
  assert.match(settingsSource, /visibleLanguageOptions\.length > 0/);
  assert.match(settingsSource, /pickerCopy\.noResults/);
  assert.doesNotMatch(settingsSource, /user-scalable\s*=\s*no/i);
});

test('language rows keep flag placement stable while isolating script direction', () => {
  assert.match(settingsSource, /<strong dir=\{currentLanguage\.direction\}>/);
  assert.match(settingsSource, /<strong dir=\{option\.direction\}>/);
  assert.match(settingsSource, /<small dir="ltr">/);
  assert.match(settingsSource, /\.languageOptionCopy \{[^}]*text-align:left/s);
  assert.match(headerPickerSource, /dir=\{option\.direction\}/);
  assert.match(headerPickerSource, /unicode-bidi:plaintext/);
});

test('header invite picker closes safely on focus exit and uses matched motion', () => {
  assert.match(headerPickerSource, /onBlur=/);
  assert.match(headerPickerSource, /event\.relatedTarget/);
  assert.match(headerPickerSource, /pendingLocaleRef/);
  assert.match(headerPickerSource, /onAnimationEnd=/);
  assert.match(headerPickerSource, /MENU_CLOSE_FALLBACK_MS/);
  assert.match(headerPickerSource, /headerLanguageMenuIn/);
  assert.match(headerPickerSource, /headerLanguageMenuOut/);
  assert.match(headerPickerSource, /prefers-reduced-motion: reduce/);
  assert.match(headerPickerSource, /aria-controls="header-language-menu"/);
});

test('language picker search copy covers every registered locale', () => {
  const localeDefinitions = [
    ...localesSource.matchAll(/\{ locale: '([^']+)'/g),
  ].map((match) => match[1]);
  assert.ok(localeDefinitions.length > 0);

  for (const locale of localeDefinitions) {
    const escaped = locale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      pickerCopySource,
      new RegExp(`(?:^|\\n)\\s*(?:'${escaped}'|${escaped}):\\s*\\{\\s*search:`),
      `missing language picker copy for ${locale}`,
    );
  }
});
