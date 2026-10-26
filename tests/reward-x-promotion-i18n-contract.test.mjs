import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { SUPPORTED_LOCALES } from '../src/lib/i18n/locales.ts';
import { REWARD_X_PROMOTION_COPY } from '../src/lib/i18n/rewardXPromotionCopy.ts';
import {
  REWARD_X_PROMOTION_SUBMIT_ERROR_COPY,
  rewardXPromotionSubmitError,
} from '../src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts';

const mainCopy = readFileSync('src/lib/i18n/rewardXPromotionCopy.ts', 'utf8');
const packA = readFileSync('src/lib/i18n/rewardXPromotionExpandedCopyA.ts', 'utf8');
const packB = readFileSync('src/lib/i18n/rewardXPromotionExpandedCopyB.ts', 'utf8');
const panel = readFileSync('src/components/RewardXPromotionPanel.tsx', 'utf8');

test('X promotion copy covers all 29 locales without English spread fallbacks', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.doesNotMatch(mainCopy + packA + packB, /\.\.\.EN\b/);

  const required = [
    'title','openBody','graceBody','verifyingBody','retentionBody',
    'reviewBody','payoutBody','paidBody','expiredBody','releasedBody',
    'preparingBody','shareFollowupBody','postUrlPlaceholder','verify',
    'verifying','retry','connectX','connectedX','autoConnectBody',
    'autoOpenBody','autoShareFollowupBody','autoGraceBody','autoConnectedX',
  ];

  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_COPY[locale];
    assert.ok(copy, 'missing X promotion copy: ' + locale);
    for (const key of required) {
      const value = copy[key];
      assert.equal(typeof value, 'string', locale + ' ' + key + ' must be text');
      assert.ok(value.trim().length > 0, locale + ' ' + key + ' is empty');
    }
  }
});

test('X promotion submit errors are localized and mapped by safe status class', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY[locale];
    assert.ok(copy, 'missing submit error copy: ' + locale);
    for (const key of ['invalidPost','walletAccess','conflict','rateLimited','unavailable']) {
      assert.ok(copy[key].trim().length > 0, locale + ' ' + key + ' is empty');
    }
    assert.equal(rewardXPromotionSubmitError(locale, 400), copy.invalidPost);
    assert.equal(rewardXPromotionSubmitError(locale, 401), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 403), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 409), copy.conflict);
    assert.equal(rewardXPromotionSubmitError(locale, 429), copy.rateLimited);
    assert.equal(rewardXPromotionSubmitError(locale, 500), copy.unavailable);
  }
});

test('X promotion UI never renders raw API error messages and has bidi/mobile guards', () => {
  assert.match(panel, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panel, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(panel, /body\.error\s*\|\|/);
  assert.doesNotMatch(panel, /error instanceof Error[\s\S]*error\.message/);

  for (const guard of [
    'lang={locale}',
    'dir={direction}',
    'dir="ltr"',
    'overflow-wrap:anywhere',
    'white-space:normal',
    'unicode-bidi:isolate',
    '@media(max-width:430px)',
  ]) {
    assert.ok(panel.includes(guard), 'missing layout guard: ' + guard);
  }
});
