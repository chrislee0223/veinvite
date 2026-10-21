import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { SUPPORTED_LOCALES } from '../src/lib/i18n/locales.ts';
import { REWARD_X_PROMOTION_COPY } from '../src/lib/i18n/rewardXPromotionCopy.ts';
import { REWARD_X_PROMOTION_AUTO_COPY } from '../src/lib/i18n/rewardXPromotionAutoCopy.ts';
import {
  REWARD_X_PROMOTION_SUBMIT_ERROR_COPY,
  rewardXPromotionSubmitError,
} from '../src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts';
import {
  rewardReceiptShareLabel,
  rewardReceiptShareText,
  rewardReceiptXIntentUrl,
} from '../src/lib/rewards/rewardReceiptShare.ts';

const copySource = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const panelSource = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
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
  'shareFollowupBody',
];

test('X promotion body copy is complete and locally written for all supported locales', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.doesNotMatch(copySource, /\.\.\.EN\b/);

  const english = REWARD_X_PROMOTION_COPY.en;
  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_COPY[locale];
    assert.ok(copy, 'missing X promotion copy: ' + locale);

    for (const key of [
      'title',
      ...BODY_KEYS,
      'postUrlPlaceholder',
      'verify',
      'verifying',
      'retry',
    ]) {
      assert.equal(typeof copy[key], 'string', locale + ' ' + key + ' must be text');
      assert.ok(copy[key].trim().length > 0, locale + ' ' + key + ' is empty');
    }

    if (locale !== 'en') {
      for (const key of BODY_KEYS) {
        assert.notEqual(
          copy[key],
          english[key],
          locale + ' still falls back to English for ' + key,
        );
      }
    }
  }
});

test('automatic X connection/search copy is localized for every locale', () => {
  const english = REWARD_X_PROMOTION_AUTO_COPY.en;
  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_AUTO_COPY[locale];
    const values = [
      copy.connectX,
      copy.connectedX,
      copy.autoConnectBody,
      copy.autoOpenBody,
      copy.autoGraceBody,
      copy.autoConnectedX,
    ];
    for (const value of values) {
      assert.equal(typeof value, 'string');
      assert.ok(value.trim().length > 0, locale + ' has empty auto-X copy');
    }

    if (locale !== 'en') {
      const different = values.filter((value, index) =>
        value !== [
          english.connectX,
          english.connectedX,
          english.autoConnectBody,
          english.autoOpenBody,
          english.autoGraceBody,
          english.autoConnectedX,
        ][index],
      ).length;
      assert.ok(
        different >= 4,
        locale + ' still relies too heavily on English auto-X copy',
      );
    }
  }

  assert.match(panelSource, /REWARD_X_PROMOTION_AUTO_COPY\[locale\]/);
  assert.doesNotMatch(
    panelSource,
    /copy\.auto(?:ConnectBody|OpenBody|GraceBody|ConnectedX)\s*\?\?/,
  );
});

test('X promotion submit errors are localized and raw API errors are not rendered', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY[locale];
    for (const value of Object.values(copy)) {
      assert.equal(typeof value, 'string');
      assert.ok(value.trim().length > 0);
    }

    assert.equal(rewardXPromotionSubmitError(locale, 400), copy.invalidPost);
    assert.equal(rewardXPromotionSubmitError(locale, 401), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 403), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 409), copy.conflict);
    assert.equal(rewardXPromotionSubmitError(locale, 429), copy.rateLimited);
    assert.equal(rewardXPromotionSubmitError(locale, 500), copy.unavailable);
  }

  const submitStart = panelSource.indexOf('const submitPost');
  const submitEnd = panelSource.indexOf('if (loading)', submitStart);
  const submitBlock = panelSource.slice(submitStart, submitEnd);
  assert.match(submitBlock, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(submitBlock, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(submitBlock, /body\.error/);
  assert.doesNotMatch(submitBlock, /error\.message/);
});

test('X promotion panel keeps long-copy and bidi layout guards', () => {
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
    assert.ok(panelSource.includes(expected), 'missing layout guard: ' + expected);
  }

  assert.match(
    panelSource,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});

test('public X campaign post stays global while in-app share controls remain localized', () => {
  const baseline = rewardReceiptShareText({
    locale: 'en',
    amountB3tr: '193.91',
  });

  for (const locale of SUPPORTED_LOCALES) {
    assert.ok(rewardReceiptShareLabel(locale).trim().length > 0);

    assert.equal(
      rewardReceiptShareText({
        locale,
        amountB3tr: '193.91',
      }),
      baseline,
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
