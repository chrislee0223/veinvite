import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SUPPORTED_LOCALES,
} from '../src/lib/i18n/locales.ts';
import {
  REWARD_X_PROMOTION_COPY,
} from '../src/lib/i18n/rewardXPromotionCopy.ts';
import {
  REWARD_X_PROMOTION_AUTO_COPY,
} from '../src/lib/i18n/rewardXPromotionAutoCopy.ts';
import {
  REWARD_X_PROMOTION_SUBMIT_ERROR_COPY,
  rewardXPromotionSubmitError,
} from '../src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts';
import {
  rewardReceiptShareLabel,
  rewardReceiptShareText,
  rewardReceiptXIntentUrl,
} from '../src/lib/rewards/rewardReceiptShare.ts';

const promotionSource = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const expandedSource = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopy.ts',
  'utf8',
);
const panelSource = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);

const REQUIRED_PROMOTION_KEYS = [
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

test('X promotion copy is complete without English body fallback for all 29 locales', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.doesNotMatch(promotionSource, /\.\.\.EN\b/);
  assert.doesNotMatch(expandedSource, /\.\.\.EN\b/);

  const english = REWARD_X_PROMOTION_COPY.en;

  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_COPY[locale];
    assert.ok(copy, 'missing promotion copy: ' + locale);

    for (const key of REQUIRED_PROMOTION_KEYS) {
      const value = copy[key];
      assert.equal(typeof value, 'string', locale + ' ' + key + ' must be text');
      assert.ok(value.trim().length > 0, locale + ' ' + key + ' is empty');
    }

    if (locale !== 'en') {
      for (const key of [
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
      ]) {
        assert.notEqual(
          copy[key],
          english[key],
          locale + ' still exposes English for ' + key,
        );
      }
    }
  }
});

test('automatic X account flow is explicitly localized for every locale', () => {
  const english = REWARD_X_PROMOTION_AUTO_COPY.en;
  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_AUTO_COPY[locale];
    assert.ok(copy, 'missing automatic X copy: ' + locale);
    for (const key of [
      'connectX',
      'connectedX',
      'autoConnectBody',
      'autoOpenBody',
      'autoShareFollowupBody',
      'autoGraceBody',
      'autoConnectedX',
    ]) {
      assert.equal(typeof copy[key], 'string');
      assert.ok(copy[key].trim().length > 0, locale + ' ' + key + ' is empty');
    }
    if (locale !== 'en' && locale !== 'pcm') {
      assert.notEqual(copy.autoOpenBody, english.autoOpenBody);
      assert.notEqual(copy.autoConnectedX, english.autoConnectedX);
    }
  }
  assert.doesNotMatch(
    panelSource,
    /REWARD_X_PROMOTION_COPY\.en\.(?:auto|connect)/,
  );
});

test('X promotion submission failures never expose raw server English', () => {
  const submitStart = panelSource.indexOf('const submitPost');
  const submitEnd = panelSource.indexOf('if (loading)', submitStart);
  const submitBlock = panelSource.slice(submitStart, submitEnd);

  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY[locale];
    assert.ok(copy, 'missing submit error copy: ' + locale);
    assert.equal(rewardXPromotionSubmitError(locale, 400), copy.invalidPost);
    assert.equal(rewardXPromotionSubmitError(locale, 401), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 403), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 409), copy.conflict);
    assert.equal(rewardXPromotionSubmitError(locale, 429), copy.rateLimited);
    assert.equal(rewardXPromotionSubmitError(locale, 500), copy.unavailable);
    assert.equal(rewardXPromotionSubmitError(locale, 0), copy.unavailable);
  }

  assert.match(
    submitBlock,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
  assert.match(submitBlock, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(submitBlock, /body\.error\s*\|\|/);
  assert.doesNotMatch(
    submitBlock,
    /error instanceof Error[\s\S]*error\.message/,
  );
});

test('X promotion panel carries long-copy, mobile and bidi guards', () => {
  for (const expected of [
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

test('localized X control labels stay compact and public campaign post stays reviewed-global', () => {
  const baseline = rewardReceiptShareText({
    locale: 'en',
    amountB3tr: '193.91',
  });

  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_COPY[locale];

    assert.ok([...copy.title].length <= 32, locale + ' title is unexpectedly long');
    assert.ok([...copy.verify].length <= 30, locale + ' verify label is unexpectedly long');
    assert.ok([...copy.retry].length <= 26, locale + ' retry label is unexpectedly long');

    const label = rewardReceiptShareLabel(locale);
    assert.ok(label.trim().length > 0);
    assert.ok([...label].length <= 24, locale + ' share label is unexpectedly long');

    assert.equal(
      rewardReceiptShareText({ locale, amountB3tr: '193.91' }),
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
  }
});
