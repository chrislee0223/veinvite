import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const locales = read('src/lib/i18n/locales.ts');
const copy = read('src/lib/i18n/rewardXPromotionCopy.ts');
const expanded = read('src/lib/i18n/rewardXPromotionExpandedCopy.ts');
const uiFallback = read('src/lib/i18n/rewardXPromotionUiFallbackCopy.ts');
const panel = read('src/components/RewardXPromotionPanel.tsx');

const supportedLocales = [...locales.matchAll(/\{ locale: '([^']+)'/g)].map(
  (match) => match[1],
);

const expandedLocales = [
  'hi', 'ar', 'bn', 'sv', 'ro', 'ur', 'pcm',
  'arz', 'mr', 'te', 'sw', 'ha', 'el', 'cs',
];

test('X promotion copy no longer inherits English for expanded locales', () => {
  assert.equal(supportedLocales.length, 29);
  assert.doesNotMatch(copy, /\.\.\.EN\b/);
  assert.match(copy, /\.\.\.REWARD_X_PROMOTION_EXPANDED_COPY/);

  for (const locale of expandedLocales) {
    assert.match(
      expanded,
      new RegExp('(?:^|\\n)\\s*' + locale + ':\\s*\\{', 'u'),
      'missing expanded X promotion copy for ' + locale,
    );
  }

  for (const field of [
    'title',
    'openBody',
    'graceBody',
    'verifyingBody',
    'retentionBody',
    'reviewBody',
    'payoutBody',
    'paidBody',
    'expiredBody',
    'releasedBody',
    'preparingBody',
    'shareFollowupBody',
    'postUrlPlaceholder',
    'verify',
    'verifying',
    'retry',
  ]) {
    const count = (expanded.match(new RegExp('\\b' + field + ':', 'g')) ?? []).length;
    assert.equal(
      count,
      expandedLocales.length,
      field + ' must exist for every expanded locale',
    );
  }
});

test('automatic X verification and submit-error UI has a localized fallback for all locales', () => {
  const definedLocales = [
    ...uiFallback.matchAll(/^\s{2}(?:'([^']+)'|([a-z]+)):\s*\{/gmu),
  ].map((match) => match[1] ?? match[2]);

  assert.deepEqual(
    [...new Set(definedLocales)].sort(),
    [...supportedLocales].sort(),
  );

  for (const field of [
    'connectX',
    'connectedX',
    'autoBody',
    'autoGraceBody',
    'submitError',
  ]) {
    const count = (uiFallback.match(new RegExp('\\b' + field + ':', 'g')) ?? []).length;
    assert.equal(count, supportedLocales.length);
  }
});

test('X promotion panel never exposes raw submit API errors or falls back to English automation copy', () => {
  assert.match(panel, /uiFallback\.submitError/);
  assert.doesNotMatch(
    panel.slice(panel.indexOf('const submitPost')),
    /body\.error|error\.message|The X Post could not be verified/,
  );
  assert.doesNotMatch(panel, /REWARD_X_PROMOTION_COPY\.en\.(?:auto|connect|connected)/);
});

test('X promotion panel has mobile, RTL and long-copy layout guards', () => {
  for (const token of [
    'getLocaleDirection',
    'lang={locale}',
    'dir={direction}',
    'dir="ltr"',
    'overflow-wrap:anywhere',
    'white-space:normal',
    'unicode-bidi:isolate',
    '@media(max-width:430px)',
    'grid-template-columns:1fr',
  ]) {
    assert.ok(panel.includes(token), 'missing X promotion layout guard: ' + token);
  }

  assert.match(
    panel,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});
