import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SUPPORTED_LOCALES,
} from '../src/lib/i18n/locales.ts';
import {
  rewardReceiptShareLabel,
  rewardReceiptShareText,
  rewardReceiptXIntentUrl,
} from '../src/lib/rewards/rewardReceiptShare.ts';
import {
  REWARD_X_PROMOTION_SUBMIT_ERROR_COPY,
  rewardXPromotionSubmitError,
} from '../src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts';

const xCopySource = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const xExpandedCopySource = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopy.ts',
  'utf8',
);
const combinedXCopySource =
  xCopySource + '\n' + xExpandedCopySource;
const panelSource = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);
const submitErrorSource = readFileSync(
  'src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts',
  'utf8',
);

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

function localeBlock(locale) {
  if (locale === 'en') {
    const match = xCopySource.match(
      /const EN: RewardXPromotionCopy = \{([\s\S]*?)\n\};/,
    );
    assert.ok(match, 'missing English X promotion copy');
    return match[1];
  }

  const escaped = escapeRegExp(locale);
  const match = combinedXCopySource.match(
    new RegExp(
      "(?:^|\\n)\\s*(?:'" + escaped + "'|" + escaped + "):\\s*\\{([\\s\\S]*?)\\n\\s*\\},",
      'm',
    ),
  );
  assert.ok(match, 'missing X promotion copy: ' + locale);
  return match[1];
}

function fieldValue(block, key) {
  const match = block.match(
    new RegExp('\\b' + key + ":\\s*(['\"])(.*?)\\1,"),
  );
  assert.ok(match, 'missing X promotion field: ' + key);
  return match[2];
}

test('X promotion copy is complete and locally written for all supported locales', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.doesNotMatch(combinedXCopySource, /\.\.\.EN\b/);

  const english = localeBlock('en');

  for (const locale of SUPPORTED_LOCALES) {
    const block = localeBlock(locale);

    for (const key of [
      'title',
      ...BODY_KEYS,
      'postUrlPlaceholder',
      'verify',
      'verifying',
      'retry',
    ]) {
      const value = fieldValue(block, key);
      assert.ok(value.trim().length > 0, locale + ' ' + key + ' is empty');
    }

    if (locale !== 'en') {
      for (const key of BODY_KEYS) {
        assert.notEqual(
          fieldValue(block, key),
          fieldValue(english, key),
          locale + ' still falls back to English for ' + key,
        );
      }
    }
  }
});

test('localized X promotion controls stay compact enough for wrapped mobile UI', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const block = localeBlock(locale);
    assert.ok([...fieldValue(block, 'title')].length <= 30, locale + ' title is unexpectedly long');
    assert.ok([...fieldValue(block, 'verify')].length <= 28, locale + ' verify label is unexpectedly long');
    assert.ok([...fieldValue(block, 'verifying')].length <= 24, locale + ' verifying label is unexpectedly long');
    assert.ok([...fieldValue(block, 'retry')].length <= 24, locale + ' retry label is unexpectedly long');

    const shareLabel = rewardReceiptShareLabel(locale);
    assert.ok(shareLabel.trim().length > 0, locale + ' X share label is empty');
    assert.ok([...shareLabel].length <= 24, locale + ' X share label is unexpectedly long');
  }
});

test('public X post stays intentionally global while localized UI labels vary', () => {
  const baseline = rewardReceiptShareText({
    locale: 'en',
    amountB3tr: '193.91',
  });

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
    assert.match(text, /@Veinvite/);
    assert.match(text, /#B3TR/);
    assert.match(text, /#VeBetterDAO/);
    assert.doesNotMatch(text, /\bfriend(?:s)?\b/i);
  }
});

test('X promotion panel has long-copy and bidi layout guards', () => {
  for (const expected of [
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
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});

test('X promotion submission errors are localized for all supported locales', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY[locale];
    assert.ok(copy, 'missing submit error copy: ' + locale);

    for (const key of [
      'invalidPost',
      'walletAccess',
      'conflict',
      'rateLimited',
      'unavailable',
    ]) {
      const value = copy[key];
      assert.equal(typeof value, 'string', locale + ' ' + key + ' must be text');
      assert.ok(value.trim().length > 0, locale + ' ' + key + ' is empty');
    }

    if (locale !== 'en') {
      assert.notEqual(copy.invalidPost, REWARD_X_PROMOTION_SUBMIT_ERROR_COPY.en.invalidPost);
      assert.notEqual(copy.walletAccess, REWARD_X_PROMOTION_SUBMIT_ERROR_COPY.en.walletAccess);
      assert.notEqual(copy.conflict, REWARD_X_PROMOTION_SUBMIT_ERROR_COPY.en.conflict);
      assert.notEqual(copy.rateLimited, REWARD_X_PROMOTION_SUBMIT_ERROR_COPY.en.rateLimited);
      assert.notEqual(copy.unavailable, REWARD_X_PROMOTION_SUBMIT_ERROR_COPY.en.unavailable);
    }

    assert.equal(rewardXPromotionSubmitError(locale, 400), copy.invalidPost);
    assert.equal(rewardXPromotionSubmitError(locale, 401), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 403), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 409), copy.conflict);
    assert.equal(rewardXPromotionSubmitError(locale, 429), copy.rateLimited);
    assert.equal(rewardXPromotionSubmitError(locale, 500), copy.unavailable);
    assert.equal(rewardXPromotionSubmitError(locale, 0), copy.unavailable);
  }

  assert.doesNotMatch(submitErrorSource, /\.\.\.EN\b/);
});

test('X promotion client never renders raw API or network error messages', () => {
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(panelSource, /body\.error\s*\|\|/);
  assert.doesNotMatch(panelSource, /error instanceof Error[\s\S]*error\.message/);
  assert.doesNotMatch(panelSource, /The X Post could not be verified\./);
});
