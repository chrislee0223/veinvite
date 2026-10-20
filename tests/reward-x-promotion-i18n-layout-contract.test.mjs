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
const expandedCopySource = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopy.ts',
  'utf8',
);
const submitErrorSource = readFileSync(
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
const qaHarnessSource = readFileSync(
  'src/qa/QaNotificationStateHarness.tsx',
  'utf8',
);
const qaPageSource = readFileSync(
  'src/app/qa/notification-state/page.tsx',
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

test('X promotion copy covers every supported locale without English body fallbacks', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.doesNotMatch(copySource, /\.\.\.EN\b/);
  assert.doesNotMatch(expandedCopySource, /\.\.\.EN\b/);

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
      const value = copy[key];
      assert.equal(typeof value, 'string', locale + ' ' + key + ' must be text');
      assert.ok(value.trim().length > 0, locale + ' ' + key + ' is empty');
    }

    if (locale !== 'en') {
      for (const key of BODY_KEYS) {
        assert.notEqual(
          copy[key],
          english[key],
          locale + ' still uses the English body for ' + key,
        );
      }
    }
  }
});

test('localized X promotion controls stay bounded for wrapped mobile layout', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_COPY[locale];
    assert.ok([...copy.title].length <= 32, locale + ' title is unexpectedly long');
    assert.ok([...copy.verify].length <= 30, locale + ' verify label is unexpectedly long');
    assert.ok([...copy.verifying].length <= 26, locale + ' verifying label is unexpectedly long');
    assert.ok([...copy.retry].length <= 26, locale + ' retry label is unexpectedly long');

    const shareLabel = rewardReceiptShareLabel(locale);
    assert.ok(shareLabel.trim().length > 0, locale + ' share label is empty');
    assert.ok([...shareLabel].length <= 26, locale + ' share label is unexpectedly long');
  }
});

test('X promotion submission errors are localized and status mapped for every locale', () => {
  assert.doesNotMatch(submitErrorSource, /\.\.\.EN\b/);
  const english = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY.en;

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
      if (locale !== 'en') {
        assert.notEqual(
          value,
          english[key],
          locale + ' still uses English submit error ' + key,
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
});

test('X promotion client never renders raw submit API or exception messages', () => {
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(panelSource, /PromotionSubmitResponse/);
  assert.doesNotMatch(
    panelSource,
    /error instanceof Error[\s\S]*error\.message/,
  );
  assert.doesNotMatch(
    panelSource,
    /The X Post could not be verified\./,
  );
});

test('X promotion panel has bidi and long-copy layout guards', () => {
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
    assert.ok(panelSource.includes(expected), 'missing panel guard: ' + expected);
  }

  assert.match(
    panelSource,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});

test('reward receipt lets long localized labels and explorer copy wrap', () => {
  assert.match(
    receiptSource,
    /notificationReceiptFacts dt\{[^}]*overflow-wrap:anywhere/,
  );
  assert.match(
    receiptSource,
    /notificationExplorerLink\{[^}]*white-space:normal[^}]*overflow-wrap:anywhere/,
  );
});

test('QA exposes a direct real receipt/X promotion state without notification click timing', () => {
  assert.match(qaHarnessSource, /'NOTI-X-PROMOTION-OPEN'/);
  assert.match(qaHarnessSource, /<RewardReceiptView/);
  assert.match(qaHarnessSource, /data-qa-x-promotion-direct="true"/);
  assert.match(qaPageSource, /'NOTI-X-PROMOTION-OPEN'/);
});

test('public X campaign post remains one reviewed global template while UI labels stay localized', () => {
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
