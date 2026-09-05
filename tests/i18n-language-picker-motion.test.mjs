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

test('language picker copy covers every registered locale with explicit search and empty-state text', () => {
  const locales = [...localesSource.matchAll(/\{ locale: '([^']+)'/g)]
    .map((match) => match[1]);

  assert.ok(locales.length > 0);
  for (const locale of locales) {
    const escaped = locale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      pickerCopySource,
      new RegExp(`(?:'${escaped}'|${escaped}):\\s*\\{[\\s\\S]*?searchPlaceholder: '[^']+'[\\s\\S]*?noResults: '[^']+'`),
      `missing language picker copy for ${locale}`,
    );
  }

  assert.match(pickerCopySource, /searchPlaceholder: '언어 검색'/);
  assert.match(pickerCopySource, /noResults: '검색 결과가 없어요'/);
});

test('settings language sheet preserves content through exit motion and respects reduced motion', () => {
  assert.match(settingsSource, /const \[languageClosing, setLanguageClosing\] = useState\(false\)/);
  assert.match(settingsSource, /pendingLanguageRef/);
  assert.match(settingsSource, /finishLanguagePickerClose/);
  assert.match(settingsSource, /onAnimationEnd=\{handleLanguageModalAnimationEnd\}/);
  assert.match(settingsSource, /prefers-reduced-motion: reduce/);
  assert.match(settingsSource, /setLanguageClosing\(true\)/);
  assert.match(settingsSource, /setLanguageQuery\(''\)/);
  assert.match(settingsSource, /onLocaleChange\(nextLocale\)/);
  assert.match(settingsSource, /languageModalBackdrop\.closing/);
  assert.match(settingsSource, /languageModal\.closing/);
});

test('settings language search is iPhone-safe, clearer, denser, and has an empty state', () => {
  assert.match(settingsSource, /placeholder=\{languageCopy\.searchPlaceholder\}/);
  assert.match(settingsSource, /aria-label=\{languageCopy\.searchPlaceholder\}/);
  assert.match(settingsSource, /font-size:1rem/);
  assert.match(settingsSource, /visibleLanguageOptions\.length > 0/);
  assert.match(settingsSource, /className="languageNoResults" role="status"/);
  assert.match(settingsSource, /min-height:52px/);
  assert.match(settingsSource, /onPointerDown=\{\(event\) =>/);
  assert.match(settingsSource, /max-height:min\(82dvh,680px\)/);
  assert.match(settingsSource, /env\(safe-area-inset-bottom\)/);
});

test('language rows keep flags anchored while isolating RTL text direction', () => {
  assert.doesNotMatch(
    settingsSource,
    /className="languageOptionCopy"\s+dir=/,
  );
  assert.match(
    settingsSource,
    /<strong dir=\{currentLanguage\.direction\}>/,
  );
  assert.match(
    settingsSource,
    /<strong dir=\{option\.direction\}>/,
  );
  assert.match(
    headerPickerSource,
    /className="headerLanguageOptionName"\s+dir=\{option\.direction\}/,
  );
  assert.match(headerPickerSource, /text-align:left; unicode-bidi:isolate/);
});

test('direct-invite language menu gets matched exit motion and closes on focus departure', () => {
  assert.match(headerPickerSource, /const \[closing, setClosing\] = useState\(false\)/);
  assert.match(headerPickerSource, /pendingLocaleRef/);
  assert.match(headerPickerSource, /onBlur=\{handlePickerBlur\}/);
  assert.match(headerPickerSource, /requestClose\(\{ restoreFocus: true \}\)/);
  assert.match(headerPickerSource, /onAnimationEnd=\{handleMenuAnimationEnd\}/);
  assert.match(headerPickerSource, /headerLanguageMenu\.closing/);
  assert.match(headerPickerSource, /headerLanguageMenuIn 140ms/);
  assert.match(headerPickerSource, /headerLanguageMenuOut 115ms/);
  assert.match(headerPickerSource, /aria-controls="veinvite-header-language-menu"/);
  assert.match(headerPickerSource, /prefers-reduced-motion: reduce/);

  const requestCloseStart = headerPickerSource.indexOf(
    'const requestClose = useCallback',
  );
  const requestCloseEnd = headerPickerSource.indexOf(
    'const openPicker = useCallback',
    requestCloseStart,
  );
  assert.ok(requestCloseStart >= 0);
  assert.ok(requestCloseEnd > requestCloseStart);

  const requestCloseBody = headerPickerSource.slice(
    requestCloseStart,
    requestCloseEnd,
  );
  const closeGuardIndex = requestCloseBody.indexOf(
    'if (!open || closing) return;',
  );
  const pendingIndex = requestCloseBody.indexOf(
    'pendingLocaleRef.current =',
  );
  assert.ok(closeGuardIndex >= 0);
  assert.ok(pendingIndex > closeGuardIndex);

  const openPickerStart = headerPickerSource.indexOf(
    'const openPicker = useCallback',
  );
  const openPickerEnd = headerPickerSource.indexOf(
    'useEffect(() => () =>',
    openPickerStart,
  );
  assert.ok(openPickerStart >= 0);
  assert.ok(openPickerEnd > openPickerStart);

  const openPickerBody = headerPickerSource.slice(
    openPickerStart,
    openPickerEnd,
  );
  const openGuardIndex = openPickerBody.indexOf(
    'if (closing) return;',
  );
  const clearPendingIndex = openPickerBody.indexOf(
    'pendingLocaleRef.current = null;',
  );
  assert.ok(openGuardIndex >= 0);
  assert.ok(clearPendingIndex > openGuardIndex);
});
