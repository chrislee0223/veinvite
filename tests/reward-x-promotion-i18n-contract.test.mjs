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

const panelSource = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);
const baseSource = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const expandedSource = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopy.ts',
  'utf8',
);
const autoSource = readFileSync(
  'src/lib/i18n/rewardXPromotionAutoCopy.ts',
  'utf8',
);
const autoExpandedSource = readFileSync(
  'src/lib/i18n/rewardXPromotionAutoExpandedCopy.ts',
  'utf8',
);

const BASE_KEYS = [
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
];

const AUTO_KEYS = [
  'connectX',
  'connectedX',
  'autoConnectBody',
  'autoOpenBody',
  'autoShareFollowupBody',
  'autoGraceBody',
  'autoConnectedX',
];

test('X promotion base copy is complete for every supported locale without EN spread fallback', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.doesNotMatch(baseSource, /\.\.\.EN\b/);
  assert.doesNotMatch(expandedSource, /\.\.\.EN\b/);

  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_COPY[locale];
    assert.ok(copy, 'missing base X promotion copy: ' + locale);

    for (const key of BASE_KEYS) {
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
        'shareFollowupBody',
      ]) {
        assert.notEqual(
          copy[key],
          REWARD_X_PROMOTION_COPY.en[key],
          locale + ' still uses English ' + key,
        );
      }
    }
  }
});

test('automatic X connection and discovery copy is complete for all 29 locales', () => {
  assert.doesNotMatch(autoSource, /\.\.\.EN\b/);
  assert.doesNotMatch(autoExpandedSource, /\.\.\.EN\b/);

  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_AUTO_COPY[locale];
    assert.ok(copy, 'missing automatic X copy: ' + locale);

    for (const key of AUTO_KEYS) {
      const value = copy[key];
      assert.equal(typeof value, 'string', locale + ' ' + key + ' must be text');
      assert.ok(value.trim().length > 0, locale + ' ' + key + ' is empty');
    }

    if (locale !== 'en') {
      for (const key of AUTO_KEYS) {
        assert.notEqual(
          copy[key],
          REWARD_X_PROMOTION_AUTO_COPY.en[key],
          locale + ' still uses English automatic copy for ' + key,
        );
      }
    }
  }
});

test('X promotion submit failures are localized and raw API errors never render', () => {
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

    assert.equal(rewardXPromotionSubmitError(locale, 400), copy.invalidPost);
    assert.equal(rewardXPromotionSubmitError(locale, 401), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 403), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 409), copy.conflict);
    assert.equal(rewardXPromotionSubmitError(locale, 429), copy.rateLimited);
    assert.equal(rewardXPromotionSubmitError(locale, 500), copy.unavailable);
    assert.equal(rewardXPromotionSubmitError(locale, 0), copy.unavailable);
  }

  assert.doesNotMatch(panelSource, /body\.error\s*\|\|/);
  assert.doesNotMatch(
    panelSource,
    /error instanceof Error[\s\S]*error\.message/,
  );
  assert.doesNotMatch(panelSource, /The X Post could not be verified\./);
  assert.match(
    panelSource,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
});

test('X promotion panel keeps long translations and bidi content inside the receipt', () => {
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

  assert.doesNotMatch(
    panelSource,
    /REWARD_X_PROMOTION_COPY\.en\.auto/,
  );
  assert.match(
    panelSource,
    /REWARD_X_PROMOTION_AUTO_COPY\[locale\]/,
  );
});
