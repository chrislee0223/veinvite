import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { SUPPORTED_LOCALES } from '../src/lib/i18n/locales.ts';
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

const panelSource = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);
const copySource = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
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

const AUTO_KEYS = [
  'connectX',
  'connectedX',
  'autoConnectBody',
  'autoOpenBody',
  'autoGraceBody',
  'autoConnectedX',
];

test('X promotion copy is complete for all 29 supported locales', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.doesNotMatch(copySource, /\.\.\.EN\b/);

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
      ...AUTO_KEYS,
    ]) {
      const value = copy[key];
      assert.equal(
        typeof value,
        'string',
        locale + ' ' + key + ' must be text',
      );
      assert.ok(
        value.trim().length > 0,
        locale + ' ' + key + ' is empty',
      );
    }
  }
});

test('automatic X verification copy is deliberate for every locale', () => {
  const english = REWARD_X_PROMOTION_AUTO_COPY.en;

  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_AUTO_COPY[locale];
    assert.ok(copy, 'missing automatic X copy: ' + locale);

    if (locale !== 'en') {
      for (const key of AUTO_KEYS) {
        assert.notEqual(
          copy[key],
          english[key],
          locale + ' still falls back to English for ' + key,
        );
      }
    }
  }
});

test('X promotion control labels stay compact enough for wrapped mobile UI', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_COPY[locale];
    const shareLabel = rewardReceiptShareLabel(locale);

    assert.ok([...copy.title].length <= 32, locale + ' title is too long');
    assert.ok([...copy.verify].length <= 30, locale + ' verify label is too long');
    assert.ok([...copy.verifying].length <= 26, locale + ' verifying label is too long');
    assert.ok([...copy.retry].length <= 26, locale + ' retry label is too long');
    assert.ok([...copy.connectX].length <= 32, locale + ' connect-X label is too long');
    assert.ok([...shareLabel].length <= 26, locale + ' share label is too long');
  }
});

test('X promotion submission errors are localized and never expose raw server errors', () => {
  const english = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY.en;

  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY[locale];
    assert.ok(copy, 'missing X submit error copy: ' + locale);

    for (const key of [
      'invalidPost',
      'walletAccess',
      'conflict',
      'rateLimited',
      'unavailable',
    ]) {
      assert.ok(copy[key].trim().length > 0, locale + ' ' + key + ' is empty');
      if (locale !== 'en') {
        assert.notEqual(
          copy[key],
          english[key],
          locale + ' submit error still uses English for ' + key,
        );
      }
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
  assert.doesNotMatch(
    panelSource,
    /error instanceof Error[\s\S]*error\.message/,
  );
});

test('public X campaign post stays intentionally global while in-app labels remain localized', () => {
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

    assert.ok(
      rewardReceiptShareLabel(locale).trim().length > 0,
      locale + ' share label is empty',
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
    assert.doesNotMatch(text, /\bfriend(?:s)?\b/i);
  }
});

test('X promotion panel keeps bidi and long-copy layout guards', () => {
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
