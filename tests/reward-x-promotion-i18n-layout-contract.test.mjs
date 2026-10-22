import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
const expandedSource = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopy.ts',
  'utf8',
);
const receiptSource = readFileSync(
  'src/components/RewardReceiptView.tsx',
  'utf8',
);

const REQUIRED_KEYS = [
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
  'connectX',
  'connectedX',
  'autoConnectBody',
  'autoOpenBody',
  'autoGraceBody',
  'autoConnectedX',
];

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

test('X promotion UI copy is complete for all 29 supported locales', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);

  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_COPY[locale];
    assert.ok(copy, 'missing X promotion copy: ' + locale);

    for (const key of REQUIRED_KEYS) {
      const value = copy[key];
      assert.equal(
        typeof value,
        'string',
        locale + ' ' + key + ' must be localized text',
      );
      assert.ok(
        value.trim().length > 0,
        locale + ' ' + key + ' must not be empty',
      );
    }
  }
});

test('former English-fallback locales now have their own full body copy', () => {
  const english = REWARD_X_PROMOTION_COPY.en;

  for (const locale of FALLBACK_LOCALES) {
    const copy = REWARD_X_PROMOTION_COPY[locale];
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
        locale + ' still inherits English for ' + key,
      );
    }
  }

  assert.doesNotMatch(
    expandedSource,
    /\.\.\.EN\b/,
    'expanded locale pack must not inherit English at source',
  );
});

test('X account connection and automatic-verification copy exists for every locale', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const auto = REWARD_X_PROMOTION_AUTO_COPY[locale];
    for (const key of [
      'connectX',
      'connectedX',
      'autoConnectBody',
      'autoOpenBody',
      'autoGraceBody',
      'autoConnectedX',
    ]) {
      assert.equal(typeof auto[key], 'string');
      assert.ok(auto[key].trim().length > 0);
    }
  }
});

test('localized control labels remain compact enough for wrapped mobile controls', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_COPY[locale];
    for (const [key, max] of [
      ['title', 32],
      ['verify', 30],
      ['verifying', 26],
      ['retry', 26],
      ['connectX', 34],
    ]) {
      assert.ok(
        [...copy[key]].length <= max,
        locale + ' ' + key + ' is unexpectedly long: ' + copy[key],
      );
    }

    const shareLabel = rewardReceiptShareLabel(locale);
    assert.ok(shareLabel.trim().length > 0);
    assert.ok(
      [...shareLabel].length <= 26,
      locale + ' share label is unexpectedly long: ' + shareLabel,
    );
  }
});

test('X promotion submit errors are localized and raw API messages never render', () => {
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
      assert.ok(copy[key].trim().length > 0);
    }

    assert.equal(rewardXPromotionSubmitError(locale, 400), copy.invalidPost);
    assert.equal(rewardXPromotionSubmitError(locale, 401), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 403), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 409), copy.conflict);
    assert.equal(rewardXPromotionSubmitError(locale, 429), copy.rateLimited);
    assert.equal(rewardXPromotionSubmitError(locale, 503), copy.unavailable);
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
  const submitBlock = panelSource.slice(
    panelSource.indexOf('const submitPost'),
    panelSource.indexOf('if (loading)', panelSource.indexOf('const submitPost')),
  );
  assert.doesNotMatch(submitBlock, /body\.error\s*\|\|/);
  assert.doesNotMatch(
    submitBlock,
    /error instanceof Error[\s\S]*error\.message/,
  );
});

test('X promotion panel contains bidi and long-copy layout guards', () => {
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

test('public X campaign post remains intentionally global and below X limit', () => {
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
    );

    const intent = new URL(rewardReceiptXIntentUrl({
      locale,
      amountB3tr: '193.91',
      referralUrl: 'https://veinvite.vercel.app/s/AbCdEfGhIjKlMnOp',
    }));
    const shareText = intent.searchParams.get('text') ?? '';
    assert.ok(shareText.length < 280);
    assert.match(shareText, /@Veinvite/);
    assert.match(shareText, /#B3TR/);
    assert.match(shareText, /#VeBetterDAO/);
    assert.doesNotMatch(shareText, /\bfriend(?:s)?\b/i);
  }
});
