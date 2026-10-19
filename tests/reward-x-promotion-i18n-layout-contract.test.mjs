import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const locales = readFileSync(
  'src/lib/i18n/locales.ts',
  'utf8',
);
const coreCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const expandedCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopy.ts',
  'utf8',
);
const submitErrors = readFileSync(
  'src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts',
  'utf8',
);
const panel = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);
const qaHarness = readFileSync(
  'src/qa/QaNotificationStateHarness.tsx',
  'utf8',
);

const registered = Array.from(
  locales.matchAll(/\{ locale: '([^']+)'/g),
  (m) => m[1],
);

test('X promotion copy covers all 29 locales without English body fallback', () => {
  assert.equal(registered.length, 29);
  assert.doesNotMatch(coreCopy, /\.\.\.EN\b/);
  assert.match(coreCopy, /REWARD_X_PROMOTION_EXPANDED_COPY/);

  const combined = coreCopy + '\n' + expandedCopy;
  for (const locale of registered) {
    const escaped = locale.replace('-', '\\-');
    assert.match(
      combined,
      new RegExp(
        '(?:^|\\n)\\s*(?:[\\x27\\x22]?' +
          escaped +
          '[\\x27\\x22]?)\\s*:',
        'm',
      ),
      'missing X promotion locale: ' + locale,
    );
  }

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
    'verify',
    'verifying',
    'retry',
  ]) {
    assert.ok(
      (combined.match(new RegExp(key + ':', 'g')) ?? []).length >= 30,
      'incomplete X promotion field: ' + key,
    );
  }
});

test('X promotion submit errors are localized and raw API messages never render', () => {
  for (const locale of registered) {
    const escaped = locale.replace('-', '\\-');
    assert.match(
      submitErrors,
      new RegExp(
        '(?:^|\\n)\\s*(?:[\\x27\\x22]?' +
          escaped +
          '[\\x27\\x22]?)\\s*:',
        'm',
      ),
      'missing submit error locale: ' + locale,
    );
  }
  assert.match(panel, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panel, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(panel, /body\.error\s*\|\|/);
  assert.doesNotMatch(panel, /error instanceof Error[\s\S]*error\.message/);
  assert.doesNotMatch(panel, /The X Post could not be verified\./);
});

test('X promotion panel is bidi and long-copy safe without shrinking typography', () => {
  for (const expected of [
    'getLocaleDirection',
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
    assert.ok(panel.includes(expected), 'missing layout guard: ' + expected);
  }

  assert.match(
    panel,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
  assert.doesNotMatch(panel, /font-size:\s*clamp\(/);
});

test('QA exposes the real reward receipt and X promotion panel directly', () => {
  assert.match(qaHarness, /\| 'NOTI-X-PROMOTION-OPEN'/);
  assert.match(qaHarness, /stateId === 'NOTI-X-PROMOTION-OPEN'/);
  assert.match(qaHarness, /<RewardReceiptView/);
  assert.match(qaHarness, /receipt=\{QA_REWARD_RECEIPT\}/);
});
