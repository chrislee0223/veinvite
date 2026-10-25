import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SUPPORTED_LOCALES,
} from '../src/lib/i18n/locales.ts';
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
const autoCoreCopySource = readFileSync(
  'src/lib/i18n/rewardXPromotionAutoCoreCopy.ts',
  'utf8',
);
const autoExpandedCopySource = readFileSync(
  'src/lib/i18n/rewardXPromotionAutoExpandedCopy.ts',
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

  const registryLocales = Array.from(
    copySource.matchAll(
      /(?:^|\n)\s*(?:'([^']+)'|([a-z]+)):\s*(?:\{|EN,)/g,
    ),
    (match) => match[1] || match[2],
  ).filter((locale) => SUPPORTED_LOCALES.includes(locale));

  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(
      registryLocales.filter((value) => value === locale).length,
      1,
      'registry must contain locale exactly once: ' + locale,
    );
  }

  const manualSources = copySource + '\n' + expandedCopySource;
  const autoSources =
    autoCoreCopySource + '\n' + autoExpandedCopySource;

  for (const key of [
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
  ]) {
    assert.ok(
      (manualSources.match(new RegExp('\\b' + key + ':', 'g')) ?? []).length >= 29,
      'manual X promotion copy is incomplete for ' + key,
    );
  }

  for (const key of [
    'connectX',
    'connectedX',
    'autoConnectBody',
    'autoOpenBody',
    'autoShareFollowupBody',
    'autoGraceBody',
    'autoConnectedX',
  ]) {
    assert.ok(
      (autoSources.match(new RegExp('\\b' + key + ':', 'g')) ?? []).length >= 28,
      'auto X promotion copy is incomplete for ' + key,
    );
    assert.match(copySource, new RegExp('\\b' + key + ': string'));
  }

  for (const locale of SUPPORTED_LOCALES) {
    const shareLabel = rewardReceiptShareLabel(locale);
    assert.ok(shareLabel.trim().length > 0, locale + ' X share label is empty');
    assert.ok(
      [...shareLabel].length <= 24,
      locale + ' X share label is unexpectedly long',
    );
  }
});

test('X promotion registry cannot silently fall back to English', () => {
  assert.doesNotMatch(copySource, /\.\.\.EN\b/);
  assert.doesNotMatch(expandedCopySource, /\.\.\.EN\b/);

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
