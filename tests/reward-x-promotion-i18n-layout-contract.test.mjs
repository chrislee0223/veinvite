import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const copy = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const expanded = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopy.ts',
  'utf8',
);
const errors = readFileSync(
  'src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts',
  'utf8',
);
const panel = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);
const notificationQa = readFileSync(
  'tests/playwright/notification-locale-layout.spec.ts',
  'utf8',
);

test('X promotion body copy has no English-spread fallback', () => {
  assert.doesNotMatch(copy, /\.\.\.EN\b/);
  assert.match(copy, /REWARD_X_PROMOTION_EXPANDED_COPY/);

  for (const locale of [
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
  ]) {
    assert.match(
      expanded,
      new RegExp("(?:'?" + locale + "'?)\\s*:\\s*\\{"),
      'missing expanded locale ' + locale,
    );
  }

  for (const field of [
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
    assert.match(expanded, new RegExp('\\b' + field + ':'));
  }
});

test('X promotion submit errors are localized and raw server errors never render', () => {
  assert.match(errors, /Record<[\s\S]*SupportedLocale/);
  assert.match(errors, /status === 400/);
  assert.match(errors, /status === 401 \|\| status === 403/);
  assert.match(errors, /status === 409/);
  assert.match(errors, /status === 429/);

  const submitBlock = panel.slice(
    panel.indexOf('const submitPost'),
    panel.indexOf('if (loading)'),
  );

  assert.match(
    submitBlock,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
  assert.match(
    submitBlock,
    /rewardXPromotionSubmitError\(locale, 0\)/,
  );
  assert.doesNotMatch(submitBlock, /body\.error\s*\|\|/);
  assert.doesNotMatch(
    submitBlock,
    /error instanceof Error[\s\S]{0,180}error\.message/,
  );
  assert.doesNotMatch(submitBlock, /The X Post could not be verified/);
});

test('X promotion panel has long-copy and RTL/LTR layout guards', () => {
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
      panel.includes(expected),
      'missing X promotion layout guard: ' + expected,
    );
  }

  assert.match(
    panel,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});

test('X promotion paid notification is included in all-locale layout audit', () => {
  assert.match(notificationQa, /NOTI-X-PROMOTION-PAID/);
  assert.match(notificationQa, /for \(const locale of SUPPORTED_LOCALES\)/);
  assert.match(notificationQa, /width: 320/);
  assert.match(notificationQa, /width: 393/);
});
