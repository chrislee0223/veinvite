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
import { rewardReceiptShareLabel } from '../src/lib/rewards/rewardReceiptShare.ts';

const copySource = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const panelSource = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);

test('X promotion copy is complete for all 29 supported locales', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.doesNotMatch(copySource, /\.\.\.EN\b/);

  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_COPY[locale];
    const auto = REWARD_X_PROMOTION_AUTO_COPY[locale];
    const errors = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY[locale];

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
      'shareFollowupBody',
      'verify',
      'verifying',
      'retry',
    ]) {
      assert.ok(
        String(copy[key]).trim().length > 0,
        locale + ' missing ' + key,
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
        String(auto[key]).trim().length > 0,
        locale + ' missing auto ' + key,
      );
    }

    for (const key of [
      'invalidPost',
      'walletAccess',
      'conflict',
      'rateLimited',
      'unavailable',
    ]) {
      assert.ok(
        String(errors[key]).trim().length > 0,
        locale + ' missing submit error ' + key,
      );
    }

    assert.ok(rewardReceiptShareLabel(locale).trim().length > 0);
  }
});

test('automatic X flow does not fall back to English for non-English locales', () => {
  const en = REWARD_X_PROMOTION_AUTO_COPY.en;
  const enError = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY.en;

  for (const locale of SUPPORTED_LOCALES) {
    if (locale === 'en') continue;
    const auto = REWARD_X_PROMOTION_AUTO_COPY[locale];
    const errors = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY[locale];

    assert.notEqual(auto.autoOpenBody, en.autoOpenBody, locale + ' autoOpenBody');
    assert.notEqual(
      auto.autoShareFollowupBody,
      en.autoShareFollowupBody,
      locale + ' autoShareFollowupBody',
    );
    assert.notEqual(errors.unavailable, enError.unavailable, locale + ' unavailable');
  }
});

test('submit error mapping is localized and stable by status class', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY[locale];
    assert.equal(rewardXPromotionSubmitError(locale, 400), copy.invalidPost);
    assert.equal(rewardXPromotionSubmitError(locale, 401), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 403), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 409), copy.conflict);
    assert.equal(rewardXPromotionSubmitError(locale, 429), copy.rateLimited);
    assert.equal(rewardXPromotionSubmitError(locale, 500), copy.unavailable);
    assert.equal(rewardXPromotionSubmitError(locale, 0), copy.unavailable);
  }
});

test('X promotion panel never renders raw submit API errors', () => {
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(panelSource, /The X Post could not be verified\./);
  assert.doesNotMatch(
    panelSource,
    /error instanceof Error[\s\S]{0,160}error\.message/,
  );
  assert.doesNotMatch(
    panelSource,
    /REWARD_X_PROMOTION_COPY\.en\.auto/,
  );
});

test('X promotion panel protects long and RTL copy without shrinking typography', () => {
  for (const guard of [
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
    assert.ok(panelSource.includes(guard), 'missing layout guard: ' + guard);
  }

  assert.match(
    panelSource,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});
