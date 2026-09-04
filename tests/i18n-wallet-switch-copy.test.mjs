import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const localesSource = await readFile(
  new URL('../src/lib/i18n/locales.ts', import.meta.url),
  'utf8',
);
const switchCopySource = await readFile(
  new URL('../src/lib/i18n/walletSwitchCopy.ts', import.meta.url),
  'utf8',
);

const locales = Array.from(
  localesSource.matchAll(/\{ locale: '([^']+)'/g),
  (match) => match[1],
);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('wallet-switch guidance has one localized entry for every supported locale', () => {
  assert.equal(locales.length, 27);

  for (const locale of locales) {
    const escaped = escapeRegex(locale);
    const keyPattern = locale.includes('-')
      ? new RegExp(`\\n\\s*'${escaped}':\\s*\\{`)
      : new RegExp(`\\n\\s*${escaped}:\\s*\\{`);

    assert.match(
      switchCopySource,
      keyPattern,
      `missing wallet-switch copy for ${locale}`,
    );
  }
});

test('wallet-switch guidance exposes the four reviewed UX fields', () => {
  assert.match(switchCopySource, /title:\s*string/);
  assert.match(switchCopySource, /description:\s*string/);
  assert.match(switchCopySource, /continueCurrent:\s*string/);
  assert.match(switchCopySource, /chooseAnother:\s*string/);
});
