import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  rewardReceiptShareLabel,
  rewardReceiptShareText,
  rewardReceiptXIntentUrl,
} from '../src/lib/rewards/rewardReceiptShare.ts';

const read = (path) => readFileSync(path, 'utf8');

const localesSource = read('src/lib/i18n/locales.ts');
const xCopySource = read('src/lib/i18n/rewardXPromotionCopy.ts');
const expandedCopySource = read('src/lib/i18n/rewardXPromotionExpandedCopy.ts');
const submitErrorSource = read('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts');
const panelSource = read('src/components/RewardXPromotionPanel.tsx');
const receiptSource = read('src/components/RewardReceiptView.tsx');
const shareSource = read('src/lib/rewards/rewardReceiptShare.ts');

const SUPPORTED_LOCALES = [
  ...localesSource.matchAll(/\{ locale: '([^']+)'/g),
].map((match) => match[1]);

const EXPANDED_LOCALES = [
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

const BODY_KEYS = [
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
];

function localeBlock(source, locale) {
  const key = locale.includes('-')
    ? "'" + locale + "'"
    : "(?:'" + locale + "'|" + locale + ")";
  const match = source.match(
    new RegExp(
      '(?:^|\\n)\\s*' + key + ':\\s*\\{([\\s\\S]*?)\\n\\s*\\},',
      'mu',
    ),
  );
  return match?.[1] ?? '';
}

function assertTextField(block, locale, key) {
  const match = block.match(
    new RegExp('\\b' + key + ':\\s*([\'\x60"])([\\s\\S]*?)\\1[,\\n]', 'u'),
  );
  assert.ok(match, locale + ' missing ' + key);
  assert.ok(match[2].trim().length > 0, locale + ' ' + key + ' is empty');
  return match[2];
}

test('X promotion registry explicitly covers every supported locale without English spreads', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.equal(new Set(SUPPORTED_LOCALES).size, 29);
  assert.doesNotMatch(xCopySource, /\.\.\.EN\b/u);
  assert.doesNotMatch(expandedCopySource, /\.\.\.EN\b/u);

  for (const locale of SUPPORTED_LOCALES) {
    assert.match(
      xCopySource,
      new RegExp("(?:^|\\n)\\s*['\"]?" + locale + "['\"]?\\s*:", 'u'),
      'missing explicit X promotion registry key: ' + locale,
    );
  }
});

test('expanded X promotion locale pack has full locally-authored state copy', () => {
  for (const locale of EXPANDED_LOCALES) {
    const block = localeBlock(expandedCopySource, locale);
    assert.ok(block, 'missing expanded X promotion locale: ' + locale);

    for (const key of [
      'title',
      ...BODY_KEYS,
      'postUrlPlaceholder',
      'verify',
      'verifying',
      'retry',
    ]) {
      assertTextField(block, locale, key);
    }
  }
});

test('localized X promotion controls stay compact enough for wrapped mobile UI', () => {
  for (const locale of EXPANDED_LOCALES) {
    const block = localeBlock(expandedCopySource, locale);
    const title = assertTextField(block, locale, 'title');
    const verify = assertTextField(block, locale, 'verify');
    const verifying = assertTextField(block, locale, 'verifying');
    const retry = assertTextField(block, locale, 'retry');

    assert.ok([...title].length <= 30, locale + ' title is unexpectedly long');
    assert.ok([...verify].length <= 28, locale + ' verify label is unexpectedly long');
    assert.ok([...verifying].length <= 24, locale + ' verifying label is unexpectedly long');
    assert.ok([...retry].length <= 24, locale + ' retry label is unexpectedly long');
  }

  for (const locale of SUPPORTED_LOCALES) {
    const shareLabel = rewardReceiptShareLabel(locale);
    assert.ok(shareLabel.trim().length > 0, locale + ' X share label is empty');
    assert.ok([...shareLabel].length <= 24, locale + ' X share label is unexpectedly long');
  }
});

test('X promotion submission error copy explicitly covers all locales and status families', () => {
  assert.doesNotMatch(submitErrorSource, /\.\.\.EN\b/u);

  for (const locale of SUPPORTED_LOCALES) {
    const block = localeBlock(submitErrorSource, locale);
    assert.ok(block, 'missing submit-error locale: ' + locale);

    for (const key of [
      'invalidPost',
      'walletAccess',
      'conflict',
      'rateLimited',
      'unavailable',
    ]) {
      assertTextField(block, locale, key);
    }
  }

  assert.match(submitErrorSource, /status === 400[\s\S]*copy\.invalidPost/u);
  assert.match(submitErrorSource, /status === 401 \|\| status === 403[\s\S]*copy\.walletAccess/u);
  assert.match(submitErrorSource, /status === 409[\s\S]*copy\.conflict/u);
  assert.match(submitErrorSource, /status === 429[\s\S]*copy\.rateLimited/u);
  assert.match(submitErrorSource, /return copy\.unavailable/u);
});

test('X promotion client never renders raw API or network error messages', () => {
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, response\.status\)/u);
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, 0\)/u);
  assert.doesNotMatch(panelSource, /body\.error/u);
  assert.doesNotMatch(panelSource, /error instanceof Error[\s\S]*error\.message/u);
  assert.doesNotMatch(panelSource, /The X Post could not be verified\./u);
});

test('public X post stays intentionally global while in-app controls stay localized', () => {
  const baseline = rewardReceiptShareText({
    locale: 'en',
    amountB3tr: '193.91',
  });

  assert.match(
    shareSource,
    /Public X campaign posts intentionally use one concise global English/u,
  );
  assert.doesNotMatch(shareSource, /\breceived:\s/u);
  assert.doesNotMatch(shareSource, /\binvite:\s/u);
  assert.doesNotMatch(shareSource, /\bfriend(?:s)?\b/iu);

  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(
      rewardReceiptShareText({
        locale,
        amountB3tr: '193.91',
      }),
      baseline,
      locale + ' changed the reviewed global X campaign post',
    );

    const intent = new URL(rewardReceiptXIntentUrl({
      locale,
      amountB3tr: '193.91',
      referralUrl: 'https://veinvite.vercel.app/s/AbCdEfGhIjKlMnOp',
    }));
    const text = intent.searchParams.get('text') ?? '';
    assert.ok(text.length < 280, locale + ' X intent exceeds 280 characters');
    assert.match(text, /@Veinvite/u);
    assert.match(text, /#B3TR/u);
    assert.match(text, /#VeBetterDAO/u);
    assert.doesNotMatch(text, /\bfriend(?:s)?\b/iu);
  }
});

test('X promotion panel keeps long-copy and bidi layout guards without removing expiry safety', () => {
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
    assert.ok(panelSource.includes(expected), 'missing panel layout guard: ' + expected);
  }

  assert.match(
    panelSource,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/u,
  );
  assert.match(
    panelSource,
    /Date\.now\(\) >= Date\.parse\(promotion\.postDeadlineAt\)/u,
  );
  assert.match(panelSource, /transitionAt - Date\.now\(\) \+ 1_000/u);
});

test('reward receipt itself wraps translated description, facts and explorer link safely', () => {
  assert.match(receiptSource, /\.notificationReceiptView\{min-width:0/u);
  assert.match(receiptSource, /\.notificationReceiptHero p\{min-width:0[\s\S]*overflow-wrap:break-word/u);
  assert.match(receiptSource, /\.notificationReceiptFacts dt\{min-width:0[\s\S]*overflow-wrap:anywhere/u);
  assert.match(receiptSource, /\.notificationReceiptFacts dd\{min-width:0[\s\S]*overflow-wrap:anywhere/u);
  assert.match(receiptSource, /\.notificationExplorerLink>span:first-child\{min-width:0;overflow-wrap:anywhere\}/u);
  assert.match(receiptSource, /\.notificationExplorerLink>span:last-child\{flex:0 0 auto\}/u);
});
