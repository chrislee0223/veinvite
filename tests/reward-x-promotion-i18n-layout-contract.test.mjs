import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const localesSource = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const xCopySource = readFileSync('src/lib/i18n/rewardXPromotionCopy.ts', 'utf8');
const xExpandedSource = readFileSync('src/lib/i18n/rewardXPromotionExpandedCopy.ts', 'utf8');
const submitErrorSource = readFileSync('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts', 'utf8');
const panelSource = readFileSync('src/components/RewardXPromotionPanel.tsx', 'utf8');
const shareSource = readFileSync('src/lib/rewards/rewardReceiptShare.ts', 'utf8');

const locales = Array.from(
  localesSource.matchAll(/\{ locale: '([^']+)'/g),
  (match) => match[1],
);

const PROMOTION_FIELDS = [
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
];

const ERROR_FIELDS = [
  'invalidPost',
  'walletAccess',
  'conflict',
  'rateLimited',
  'unavailable',
];

function objectBlock(source, locale) {
  if (locale === 'en' && source.includes('const EN:')) {
    const start = source.indexOf('const EN:');
    const end = source.indexOf('\n};', start);
    return source.slice(start, end + 3);
  }

  const candidates = [
    "\n  " + locale + ": {",
    "\n  '" + locale + "': {",
  ];
  const marker = candidates.find((value) => source.includes(value));
  if (!marker) return null;

  const start = source.indexOf(marker);
  const end = source.indexOf('\n  },', start);
  if (end < 0) return null;
  return source.slice(start, end + 5);
}

test('X promotion copy is complete for all 29 supported locales', () => {
  assert.equal(locales.length, 29);
  assert.equal(new Set(locales).size, 29);

  const combined = xCopySource + '\n' + xExpandedSource;
  assert.doesNotMatch(combined, /\.\.\.EN\b/);

  for (const locale of locales) {
    const block =
      objectBlock(xCopySource, locale) ??
      objectBlock(xExpandedSource, locale);
    assert.ok(block, 'missing X promotion locale block: ' + locale);

    for (const field of PROMOTION_FIELDS) {
      assert.match(
        block,
        new RegExp('\\b' + field + '\\s*:'),
        locale + ' missing X promotion field ' + field,
      );
    }
  }
});

test('X promotion submit errors are localized for every supported locale', () => {
  assert.doesNotMatch(submitErrorSource, /\.\.\.EN\b/);

  for (const locale of locales) {
    const block = objectBlock(submitErrorSource, locale);
    assert.ok(block, 'missing X submit-error locale block: ' + locale);
    for (const field of ERROR_FIELDS) {
      assert.match(
        block,
        new RegExp('\\b' + field + '\\s*:'),
        locale + ' missing X submit error field ' + field,
      );
    }
  }

  for (const status of ['400', '401', '403', '409', '429']) {
    assert.ok(
      submitErrorSource.includes('status === ' + status),
      'missing submit error status mapping: ' + status,
    );
  }
});

test('X promotion UI never renders raw submit API or network errors', () => {
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(panelSource, /PromotionSubmitResponse/);
  assert.doesNotMatch(panelSource, /The X Post could not be verified\./);

  const submitStart = panelSource.indexOf('const submitPost');
  const submitEnd = panelSource.indexOf('\n  if (loading)', submitStart);
  const submitBlock = panelSource.slice(submitStart, submitEnd);
  assert.doesNotMatch(submitBlock, /body\.error/);
  assert.doesNotMatch(submitBlock, /error\.message/);
});

test('X promotion panel has long-copy and RTL layout guards', () => {
  for (const expected of [
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
    assert.ok(
      panelSource.includes(expected),
      'missing X promotion layout guard: ' + expected,
    );
  }

  assert.match(
    panelSource,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});

test('public X share stays friend-neutral and stale friend copy cannot be reused', () => {
  assert.doesNotMatch(shareSource, /^\s*(?:received|invite):\s*/m);

  const start = shareSource.indexOf('export function rewardReceiptShareText');
  const end = shareSource.indexOf('export function rewardReceiptShareLabel', start);
  const publicShare = shareSource.slice(start, end);

  assert.match(publicShare, /I just earned \$\{amount\} #B3TR/);
  assert.match(publicShare, /@Veinvite/);
  assert.match(publicShare, /#VeBetterDAO/);
  assert.doesNotMatch(publicShare, /\bfriend(?:s)?\b/i);
  assert.match(
    shareSource,
    /Public X campaign posts intentionally use one concise global English/,
  );
});
