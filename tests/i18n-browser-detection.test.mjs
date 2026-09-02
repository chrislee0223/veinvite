import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const locales = readFileSync('src/lib/i18n/locales.ts', 'utf8');

test('Traditional Chinese Hant browser tags resolve before base zh fallback', () => {
  const hant = locales.indexOf("normalized === 'zh-hant'");
  const hantPrefix = locales.indexOf("normalized.startsWith('zh-hant-')");
  const traditional = locales.indexOf("return 'zh-tw'", hant);
  const baseFallback = locales.indexOf("const base = normalized.split('-')[0]");

  assert.ok(hant >= 0);
  assert.ok(hantPrefix >= 0);
  assert.ok(traditional > hant);
  assert.ok(baseFallback > traditional);
});
