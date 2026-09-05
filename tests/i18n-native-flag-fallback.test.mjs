import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const localeSource = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const fallbackCss = readFileSync('src/app/header-language-flags.css', 'utf8');

const definitions = [
  ...localeSource.matchAll(
    /\{ locale: '([^']+)'[^\n]+flagSource: '([^']+)'/g,
  ),
].map((match) => ({ locale: match[1], flagSource: match[2] }));

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('native language-select fallback keeps the correct flag for every supported locale', () => {
  assert.ok(definitions.length >= 28);

  for (const { locale, flagSource } of definitions) {
    const localePattern = escapeRegex(locale);
    const flagPattern = escapeRegex(flagSource);
    assert.match(
      fallbackCss,
      new RegExp(
        `option\\[value=['\"]${localePattern}['\"]\\]:checked[\\s\\S]*?background-image:url\\(['\"]?${flagPattern}['\"]?\\)`,
      ),
      `native fallback flag is missing or incorrect for ${locale}`,
    );
  }
});

test('native fallback mirrors flag padding and placement in RTL layouts', () => {
  assert.match(fallbackCss, /html\[dir='rtl'\][\s\S]*padding-right:\s*39px/);
  assert.match(
    fallbackCss,
    /background-position:\s*calc\(100% - 10px\) center/,
  );
});
