import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const locales = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const baseCopy = readFileSync('src/lib/i18n/rewardXPromotionCopy.ts', 'utf8');
const expandedCopy = readFileSync('src/lib/i18n/rewardXPromotionExpandedCopy.ts', 'utf8');
const autoCopy = readFileSync('src/lib/i18n/rewardXPromotionAutoCopy.ts', 'utf8');
const submitErrors = readFileSync('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts', 'utf8');
const panel = readFileSync('src/components/RewardXPromotionPanel.tsx', 'utf8');
const share = readFileSync('src/lib/rewards/rewardReceiptShare.ts', 'utf8');

const supported = [
  ...locales.matchAll(/\{ locale: '([^']+)'/gmu),
].map((match) => match[1]);

const expandedLocales = new Set([
  'hi','ar','bn','sv','ro','ur','pcm','arz','mr','te','sw','ha','el','cs',
]);

function hasLocale(source, locale) {
  const escaped = locale.replaceAll('-', '\\-');
  return new RegExp(
    '(?:^|\\n)\\s*(?:\\'' + escaped + '\\'|' + escaped + '):\\s*\\{',
    'mu',
  ).test(source);
}

test('X promotion copy covers all 29 locales without English spread fallback', () => {
  assert.equal(supported.length, 29);
  assert.doesNotMatch(baseCopy, /\.\.\.EN\b/u);
  assert.doesNotMatch(expandedCopy, /\.\.\.EN\b/u);

  for (const locale of supported) {
    if (locale === 'en') {
      assert.match(baseCopy, /en:\s*EN/u);
      continue;
    }

    const source = expandedLocales.has(locale) ? expandedCopy : baseCopy;
    assert.equal(
      hasLocale(source, locale),
      true,
      'missing localized X promotion copy: ' + locale,
    );
  }
});

test('automatic X discovery copy is complete for every supported locale', () => {
  const fields = [
    'connectX',
    'connectedX',
    'autoConnectBody',
    'autoOpenBody',
    'autoGraceBody',
    'autoConnectedX',
  ];

  for (const locale of supported) {
    assert.equal(hasLocale(autoCopy, locale), true, 'missing auto copy: ' + locale);
  }

  for (const field of fields) {
    const matches = autoCopy.match(new RegExp('\\b' + field + ':', 'gu')) ?? [];
    assert.equal(matches.length, 29, 'incomplete auto field: ' + field);
  }
});

test('X promotion submit errors are localized for every supported locale', () => {
  const fields = [
    'invalidPost',
    'walletAccess',
    'conflict',
    'rateLimited',
    'unavailable',
  ];

  for (const locale of supported) {
    assert.equal(hasLocale(submitErrors, locale), true, 'missing submit errors: ' + locale);
  }

  for (const field of fields) {
    const matches = submitErrors.match(new RegExp('\\b' + field + ':', 'gu')) ?? [];
    assert.equal(matches.length, 29, 'incomplete submit error field: ' + field);
  }
});

test('X promotion UI never falls back to English or renders raw API errors', () => {
  assert.match(panel, /REWARD_X_PROMOTION_AUTO_COPY\[locale\]/u);
  assert.match(panel, /rewardXPromotionSubmitError\(locale, response\.status\)/u);
  assert.match(panel, /rewardXPromotionSubmitError\(locale, 0\)/u);
  assert.doesNotMatch(panel, /REWARD_X_PROMOTION_COPY\.en/u);
  assert.doesNotMatch(panel, /body\.error\s*\|\|/u);
  assert.doesNotMatch(panel, /error instanceof Error[\s\S]*error\.message/u);
});

test('X promotion layout explicitly protects RTL, technical LTR values and long mobile copy', () => {
  for (const expected of [
    'getLocaleDirection',
    'lang={locale}',
    'dir={direction}',
    'dir="ltr"',
    'overflow-wrap:anywhere',
    'overflow-wrap:break-word',
    'white-space:normal',
    'unicode-bidi:isolate',
    '@media(max-width:430px)',
    'grid-template-columns:1fr',
  ]) {
    assert.ok(panel.includes(expected), 'missing layout guard: ' + expected);
  }

  assert.match(
    panel,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/u,
  );
});

test('X campaign post is intentionally global, compact and friend-neutral', () => {
  assert.match(share, /Public X campaign posts intentionally use one concise global English/u);
  assert.match(share, /I just earned \$\{amount\} #B3TR/u);
  assert.match(share, /#VeBetterDAO/u);
  const fn = share.slice(
    share.indexOf('export function rewardReceiptShareText'),
    share.indexOf('export function rewardReceiptShareLabel'),
  );
  assert.doesNotMatch(fn, /\bfriend(?:s)?\b/iu);
});

test('new i18n source files stay below the codebase large-file threshold', () => {
  for (const [name, source] of [
    ['rewardXPromotionCopy.ts', baseCopy],
    ['rewardXPromotionExpandedCopy.ts', expandedCopy],
    ['rewardXPromotionAutoCopy.ts', autoCopy],
    ['rewardXPromotionSubmitErrorCopy.ts', submitErrors],
  ]) {
    assert.ok(
      Buffer.byteLength(source, 'utf8') < 30_000,
      name + ' exceeds the 30KB source threshold',
    );
  }
});
