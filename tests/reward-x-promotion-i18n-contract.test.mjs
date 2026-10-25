import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const manualCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionManualCopy.ts',
  'utf8',
);
const errorCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts',
  'utf8',
);
const panel = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);

const MANUAL_LOCALES = [
  'hi', 'ar', 'bn', 'sv', 'ro', 'ur', 'pcm',
  'arz', 'mr', 'te', 'sw', 'ha', 'el', 'cs',
];

const REQUIRED_MANUAL_FIELDS = [
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
];

test('manual X promotion locale pack fully overrides the old English-body fallbacks', () => {
  assert.match(
    mainCopy,
    /REWARD_X_PROMOTION_MANUAL_COPY/,
  );
  assert.match(
    mainCopy,
    /REWARD_X_PROMOTION_BASE_COPY/,
  );

  for (const locale of MANUAL_LOCALES) {
    const pattern = new RegExp(
      '(?:^|\\n)\\s*' +
        (locale.includes('-') ? "'" + locale + "'" : locale) +
        ':\\s*\\{([\\s\\S]*?)\\n\\s*\\},',
      'm',
    );
    const match = manualCopy.match(pattern);
    assert.ok(match, 'missing manual X locale block: ' + locale);
    const body = match[1];

    for (const field of REQUIRED_MANUAL_FIELDS) {
      assert.match(
        body,
        new RegExp('\\b' + field + ':'),
        locale + ' missing ' + field,
      );
    }
  }

  assert.doesNotMatch(manualCopy, /\.\.\.EN\b/);
});

test('X promotion submission errors have localized status buckets for all supported locales', () => {
  const localeCount =
    (errorCopy.match(/^\s*(?:'[a-z-]+'|[a-z]+):\s*\{/gmu) ?? []).length;
  assert.equal(localeCount, 29);

  for (const key of [
    'invalidPost',
    'walletAccess',
    'conflict',
    'rateLimited',
    'unavailable',
  ]) {
    const occurrences =
      (errorCopy.match(new RegExp('\\b' + key + ':', 'g')) ?? []).length;
    assert.equal(
      occurrences,
      29,
      key + ' must exist for all 29 locales',
    );
  }

  assert.match(errorCopy, /status === 400/);
  assert.match(errorCopy, /status === 401 \|\| status === 403/);
  assert.match(errorCopy, /status === 409/);
  assert.match(errorCopy, /status === 429/);
});

test('X promotion panel never renders raw submit API errors', () => {
  assert.match(
    panel,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
  assert.match(
    panel,
    /rewardXPromotionSubmitError\(locale, 0\)/,
  );
  assert.doesNotMatch(panel, /body\.error\s*\|\|/);
  assert.doesNotMatch(
    panel,
    /error instanceof Error[\s\S]*error\.message/,
  );
  assert.doesNotMatch(
    panel,
    /The X Post could not be verified\./,
  );
});

test('X promotion panel keeps long and RTL copy inside the receipt', () => {
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

  assert.match(
    panel,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});
