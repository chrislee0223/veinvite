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
const shareSource = readFileSync(
  'src/lib/rewards/rewardReceiptShare.ts',
  'utf8',
);

const COPY_KEYS = [
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
  'postUrlPlaceholder',
  'shareFollowupBody',
  'verify',
  'verifying',
  'retry',
  'connectX',
  'connectedX',
  'autoConnectBody',
  'autoOpenBody',
  'autoShareFollowupBody',
  'autoGraceBody',
  'autoConnectedX',
];

test('X promotion UI copy is complete for every supported locale', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);

  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_COPY[locale];
    assert.ok(copy, 'missing X promotion locale: ' + locale);

    for (const key of COPY_KEYS) {
      const value = copy[key];
      assert.equal(typeof value, 'string', locale + ' ' + key + ' must be text');
      assert.ok(value.trim().length > 0, locale + ' ' + key + ' is empty');
    }

    assert.ok(
      [...copy.title].length <= 32,
      locale + ' X promotion title is unexpectedly long',
    );
    assert.ok(
      [...copy.verify].length <= 28,
      locale + ' verify label is unexpectedly long',
    );
    assert.ok(
      [...copy.connectX].length <= 32,
      locale + ' connect-X label is unexpectedly long',
    );
    assert.ok(
      [...rewardReceiptShareLabel(locale)].length <= 24,
      locale + ' X share label is unexpectedly long',
    );
  }
});

test('X promotion registry cannot silently fall back to English', () => {
  assert.doesNotMatch(copySource, /\.\.\.EN\b/);

  for (const field of [
    'connectX',
    'connectedX',
    'autoConnectBody',
    'autoOpenBody',
    'autoShareFollowupBody',
    'autoGraceBody',
    'autoConnectedX',
  ]) {
    assert.doesNotMatch(
      copySource,
      new RegExp(field + '\\?:\\s*string'),
      field + ' must remain required',
    );
  }

  assert.doesNotMatch(
    panelSource,
    /REWARD_X_PROMOTION_COPY\.en\./,
  );
});

test('X promotion submission failures stay localized and hide raw API errors', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY[locale];
    for (const key of [
      'invalidPost',
      'walletAccess',
      'conflict',
      'rateLimited',
      'unavailable',
    ]) {
      assert.equal(typeof copy[key], 'string');
      assert.ok(copy[key].trim().length > 0, locale + ' ' + key + ' is empty');
    }

    assert.equal(rewardXPromotionSubmitError(locale, 400), copy.invalidPost);
    assert.equal(rewardXPromotionSubmitError(locale, 401), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 403), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 409), copy.conflict);
    assert.equal(rewardXPromotionSubmitError(locale, 429), copy.rateLimited);
    assert.equal(rewardXPromotionSubmitError(locale, 500), copy.unavailable);
    assert.equal(rewardXPromotionSubmitError(locale, 0), copy.unavailable);
  }

  assert.match(
    panelSource,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
  assert.match(
    panelSource,
    /rewardXPromotionSubmitError\(locale, 0\)/,
  );
  assert.doesNotMatch(panelSource, /body\.error\s*\|\|/);
  assert.doesNotMatch(panelSource, /error instanceof Error[\s\S]*error\.message/);
  assert.doesNotMatch(panelSource, /The X Post could not be verified\./);
});

test('X promotion panel keeps long-copy and bidi layout guards', () => {
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
    assert.ok(panelSource.includes(expected), 'missing layout guard: ' + expected);
  }

  assert.match(
    panelSource,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});

test('public X campaign text stays global while app share labels stay localized', () => {
  assert.match(
    shareSource,
    /Public X campaign posts intentionally use one concise global English/,
  );

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
      locale + ' changed the reviewed global campaign post',
    );

    const intent = new URL(
      rewardReceiptXIntentUrl({
        locale,
        amountB3tr: '193.91',
        referralUrl:
          'https://veinvite.vercel.app/s/AbCdEfGhIjKlMnOp',
      }),
    );
    const text = intent.searchParams.get('text') ?? '';
    assert.ok(text.length < 280, locale + ' X intent exceeds 280 characters');
    assert.match(text, /@Veinvite/);
    assert.match(text, /#B3TR/);
    assert.match(text, /#VeBetterDAO/);
  }
});
