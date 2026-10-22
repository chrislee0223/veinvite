import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const localesSource = readFileSync(
  'src/lib/i18n/locales.ts',
  'utf8',
);
const mainCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const expandedCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopy.ts',
  'utf8',
);
const autoCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionAutoCopy.ts',
  'utf8',
);
const submitErrorCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts',
  'utf8',
);
const panelSource = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);
const receiptSource = readFileSync(
  'src/components/RewardReceiptView.tsx',
  'utf8',
);
const shareSource = readFileSync(
  'src/lib/rewards/rewardReceiptShare.ts',
  'utf8',
);

const SUPPORTED_LOCALES = [
  ...localesSource.matchAll(/\{ locale: '([^']+)'/g),
].map((match) => match[1]);

const FALLBACK_LOCALES = [
  'hi',
  'ar',
  'bn',
  'sv',
  'ro',
  'ur',
  'pcm',
  'arz',
  'mr',
  'te',
  'sw',
  'ha',
  'el',
  'cs',
];

const MANUAL_KEYS = [
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

const AUTO_KEYS = [
  'connectX',
  'connectedX',
  'autoConnectBody',
  'autoOpenBody',
  'autoGraceBody',
  'autoConnectedX',
];

const ERROR_KEYS = [
  'invalidPost',
  'walletAccess',
  'conflict',
  'rateLimited',
  'unavailable',
];

function escapeRegex(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function localeBlock(source, locale) {
  const label = locale.includes('-')
    ? "'" + locale + "'"
    : locale;
  const re = new RegExp(
    '(?:^|\\n)\\s{2}' + escapeRegex(label) + ':\\s*\\{',
  );
  const match = re.exec(source);
  assert.ok(match, 'missing locale block: ' + locale);

  let cursor = match.index + match[0].length;
  let depth = 1;
  for (; cursor < source.length; cursor += 1) {
    if (source[cursor] === '{') depth += 1;
    if (source[cursor] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return source.slice(match.index, cursor + 1);
}

function assertKeys(block, locale, keys) {
  for (const key of keys) {
    assert.match(
      block,
      new RegExp('\\b' + escapeRegex(key) + ':'),
      locale + ' missing ' + key,
    );
  }
}

test('supported locale registry still contains exactly 29 languages', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.equal(new Set(SUPPORTED_LOCALES).size, 29);
});

test('former English-fallback locales now have complete independent body copy', () => {
  for (const locale of FALLBACK_LOCALES) {
    const block = localeBlock(expandedCopy, locale);
    assertKeys(block, locale, MANUAL_KEYS);
    assert.doesNotMatch(
      block,
      /\.\.\.EN\b/,
      locale + ' must not inherit English body copy',
    );
  }

  assert.match(
    mainCopy,
    /REWARD_X_PROMOTION_EXPANDED_COPY/,
  );
  assert.match(
    mainCopy,
    /REWARD_X_PROMOTION_AUTO_COPY/,
  );
  assert.match(mainCopy, /Object\.fromEntries/);
});

test('automatic X connection and URL-less verification copy covers every locale', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const block = localeBlock(autoCopy, locale);
    assertKeys(block, locale, AUTO_KEYS);
  }
});

test('localized X submit-error copy covers every locale and every user-facing state', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const block = localeBlock(submitErrorCopy, locale);
    assertKeys(block, locale, ERROR_KEYS);
  }

  for (const mapping of [
    "if (status === 400) return copy.invalidPost",
    "if (status === 401 || status === 403) return copy.walletAccess",
    "if (status === 409) return copy.conflict",
    "if (status === 429) return copy.rateLimited",
    "return copy.unavailable",
  ]) {
    assert.ok(
      submitErrorCopy.includes(mapping),
      'missing submit error mapping: ' + mapping,
    );
  }
});

test('X promotion submit UI never exposes raw API or exception messages', () => {
  const submitStart = panelSource.indexOf('const submitPost');
  const submitEnd = panelSource.indexOf('if (loading)', submitStart);
  assert.ok(submitStart >= 0 && submitEnd > submitStart);
  const submitBlock = panelSource.slice(submitStart, submitEnd);

  assert.match(
    submitBlock,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
  assert.match(
    submitBlock,
    /rewardXPromotionSubmitError\(locale, 0\)/,
  );
  assert.doesNotMatch(submitBlock, /body\.error\s*\|\|/);
  assert.doesNotMatch(
    submitBlock,
    /error instanceof Error[\s\S]*error\.message/,
  );
  assert.doesNotMatch(
    submitBlock,
    /The X Post could not be verified\./,
  );
});

test('X promotion panel contains long-copy and bidi layout guards', () => {
  for (const expected of [
    'getLocaleDirection',
    'lang={locale}',
    'dir={direction}',
    'dir="ltr"',
    'overflow-wrap:anywhere',
    'white-space:normal',
    'unicode-bidi:isolate',
    '@media(max-width:430px)',
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
  assert.match(
    panelSource,
    /className="promotionConnect"[\s\S]*lang=\{locale\}[\s\S]*dir=\{direction\}/,
  );
  assert.match(
    receiptSource,
    /notificationExplorerLink[^{]*\{[^}]*white-space:normal[^}]*overflow-wrap:anywhere/,
  );
});

test('public X campaign post is deliberately global while in-app controls are localized', () => {
  assert.match(
    shareSource,
    /Public X campaign posts intentionally use one concise global English/,
  );

  const functionStart = shareSource.indexOf(
    'export function rewardReceiptShareText',
  );
  const functionEnd = shareSource.indexOf(
    'export function rewardReceiptShareLabel',
    functionStart,
  );
  const shareFunction = shareSource.slice(functionStart, functionEnd);

  assert.match(shareFunction, /I just earned/);
  assert.match(shareFunction, /@Veinvite/);
  assert.match(shareFunction, /#B3TR/);
  assert.match(shareFunction, /#VeBetterDAO/);
  assert.doesNotMatch(shareFunction, /\bfriend(?:s)?\b/i);
});
