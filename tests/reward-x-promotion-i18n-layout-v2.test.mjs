import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const locales = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const mainCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const expandedCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopy.ts',
  'utf8',
);
const submitErrors = readFileSync(
  'src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts',
  'utf8',
);
const panel = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);
const receipt = readFileSync(
  'src/components/RewardReceiptView.tsx',
  'utf8',
);

const supportedLocales = [...locales.matchAll(/\{ locale: '([^']+)'/g)].map(
  (match) => match[1],
);

const explicitMainLocales = [...mainCopy.matchAll(
  /^\s*(?:'([^']+)'|([a-z]+)):\s*\{/gmu,
)]
  .map((match) => match[1] ?? match[2])
  .filter((locale) => supportedLocales.includes(locale));

const expandedLocales = [...expandedCopy.matchAll(
  /^\s*(?:'([^']+)'|([a-z]+)):\s*\{/gmu,
)]
  .map((match) => match[1] ?? match[2])
  .filter((locale) => supportedLocales.includes(locale));

const submitErrorLocales = [...submitErrors.matchAll(
  /^\s*(?:'([^']+)'|([a-z]+)):\s*\{/gmu,
)]
  .map((match) => match[1] ?? match[2])
  .filter((locale) => supportedLocales.includes(locale));

test('X promotion copy explicitly covers all 29 supported locales without EN spreads', () => {
  assert.equal(supportedLocales.length, 29);
  assert.doesNotMatch(mainCopy, /\.\.\.EN\b/);
  assert.doesNotMatch(expandedCopy, /\.\.\.EN\b/);

  const allLocales = new Set([
    ...explicitMainLocales,
    ...expandedLocales,
  ]);

  assert.deepEqual(
    [...allLocales].sort(),
    [...supportedLocales].sort(),
  );

  // English reuses the reviewed EN object instead of an inline locale block.
  assert.match(mainCopy, /\ben:\s*EN,/);
  assert.equal(
    explicitMainLocales.filter((locale) => locale !== 'en').length +
      expandedLocales.length,
    supportedLocales.length - 1,
  );
});

test('expanded X promotion copy is split into a maintainable sub-30KB module', () => {
  assert.ok(
    Buffer.byteLength(mainCopy, 'utf8') < 30_000,
    'main X promotion copy should stay below cleanup threshold',
  );
  assert.ok(
    Buffer.byteLength(expandedCopy, 'utf8') < 30_000,
    'expanded X promotion copy should stay below cleanup threshold',
  );
  assert.match(
    mainCopy,
    /\.\.\.REWARD_X_PROMOTION_EXPANDED_COPY/,
  );
});

test('X promotion submission errors cover every supported locale', () => {
  assert.deepEqual(
    [...new Set(submitErrorLocales)].sort(),
    [...supportedLocales].sort(),
  );
  assert.equal(
    submitErrorLocales.length,
    supportedLocales.length,
  );

  for (const key of [
    'invalidPost',
    'walletAccess',
    'conflict',
    'rateLimited',
    'unavailable',
  ]) {
    assert.match(
      submitErrors,
      new RegExp('\\b' + key + ':'),
      'missing submit error key ' + key,
    );
  }
});

test('X promotion panel localizes user-facing errors instead of exposing raw API messages', () => {
  assert.match(
    panel,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
  assert.match(
    panel,
    /rewardXPromotionSubmitError\(locale, 0\)/,
  );
  assert.doesNotMatch(panel, /body\.error\s*\|\|/);
  assert.doesNotMatch(
    panel,
    /error instanceof Error[\s\S]*error\.message/,
  );
  assert.doesNotMatch(
    panel,
    /The X Post could not be verified\./,
  );
});

test('X promotion layout explicitly handles long translations and RTL technical values', () => {
  assert.match(panel, /getLocaleDirection\(locale\)/);
  assert.match(panel, /lang=\{locale\}/);
  assert.match(panel, /dir=\{direction\}/);

  assert.ok(
    (panel.match(/dir="ltr"/g) ?? []).length >= 3,
    'amount and URL technical values should remain LTR isolated',
  );

  for (const guard of [
    'overflow-wrap:anywhere',
    'overflow-wrap:break-word',
    'white-space:normal',
    'unicode-bidi:isolate',
    '@media(max-width:430px)',
  ]) {
    assert.ok(
      panel.includes(guard),
      'missing layout guard: ' + guard,
    );
  }

  assert.match(
    panel,
    /@media\(max-width:430px\)\{\.promotionSubmit\{grid-template-columns:1fr\}/,
  );
});

test('reward receipt allows localized explorer actions to wrap without escaping the receipt', () => {
  assert.match(receipt, /overflow-wrap:anywhere/);
  assert.match(receipt, /white-space:normal/);
  assert.match(receipt, /dir="ltr"/);
});
