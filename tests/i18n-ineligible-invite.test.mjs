import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const localesSource = readFileSync(
  new URL('../src/lib/i18n/locales.ts', import.meta.url),
  'utf8',
);
const copySource = readFileSync(
  new URL('../src/lib/i18n/ineligibleInviterCopy.ts', import.meta.url),
  'utf8',
);

const supportedLocales = Array.from(
  localesSource.matchAll(/\{ locale: '([^']+)'/gu),
  (match) => match[1],
);
const translatedLocales = Array.from(
  copySource.matchAll(/^\s*(?:'([^']+)'|([a-z]+)):\s*\{/gmu),
  (match) => match[1] ?? match[2],
).filter((locale) => supportedLocales.includes(locale));

test('ineligible inviter notification copy covers every supported locale exactly once', () => {
  assert.ok(supportedLocales.length >= 27);
  assert.equal(new Set(supportedLocales).size, supportedLocales.length);
  assert.deepEqual(
    [...new Set(translatedLocales)].sort(),
    [...supportedLocales].sort(),
  );
  assert.equal(translatedLocales.length, supportedLocales.length);
});

test('ineligible inviter copy includes both a title and explanation for every locale', () => {
  const blocks = copySource.split(/^\s*(?:'[a-z-]+'|[a-z]+):\s*\{/gmu).slice(1);
  assert.equal(blocks.length, supportedLocales.length);

  for (const block of blocks) {
    assert.match(block, /title:\s*'[^']+'/u);
    assert.match(block, /body:\s*'[^']+'/u);
  }
});

test('ineligible inviter explanations stay concise enough for notification UI', () => {
  const bodies = Array.from(
    copySource.matchAll(/body:\s*'([^']+)'/gu),
    (match) => match[1],
  );

  assert.equal(bodies.length, supportedLocales.length);

  for (const body of bodies) {
    assert.ok(
      Array.from(body).length <= 140,
      `ineligible notification body is too long (${Array.from(body).length} characters): ${body}`,
    );
  }
});
