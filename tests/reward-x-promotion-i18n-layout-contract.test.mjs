import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const localeSource = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const xCopySource = readFileSync('src/lib/i18n/rewardXPromotionCopy.ts', 'utf8');
const expandedXCopySource = readFileSync('src/lib/i18n/rewardXPromotionExpandedCopy.ts', 'utf8');
const allXCopySource = xCopySource + '\n' + expandedXCopySource;
const submitErrorSource = readFileSync('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts', 'utf8');
const receiptCopySource = readFileSync('src/lib/i18n/rewardReceiptCopy.ts', 'utf8');
const panelSource = readFileSync('src/components/RewardXPromotionPanel.tsx', 'utf8');
const receiptSource = readFileSync('src/components/RewardReceiptView.tsx', 'utf8');
const shareSource = readFileSync('src/lib/rewards/rewardReceiptShare.ts', 'utf8');

const REGISTERED_LOCALES = Array.from(
  localeSource.matchAll(/\{ locale: '([^']+)'/g),
  (match) => match[1],
);

const BODY_KEYS = [
  'openBody', 'graceBody', 'verifyingBody', 'retentionBody',
  'reviewBody', 'payoutBody', 'paidBody', 'expiredBody',
  'releasedBody', 'preparingBody', 'shareFollowupBody',
];
const X_KEYS = [
  'title', ...BODY_KEYS, 'postUrlPlaceholder', 'verify', 'verifying', 'retry',
];
const RECEIPT_KEYS = [
  'eyebrow', 'title', 'description', 'round', 'invite', 'transaction',
  'viewTransaction', 'acknowledge', 'acknowledging', 'error',
];
const SUBMIT_ERROR_KEYS = [
  'invalidPost', 'walletAccess', 'conflict', 'rateLimited', 'unavailable',
];

function localeBlock(source, locale) {
  const escaped = locale.replaceAll('-', '\\-');
  const pattern = new RegExp(
    "(?:^|\\n)\\s{2}(?:'" + escaped + "'|" + escaped + "):\\s*\\{([\\s\\S]*?)\\n\\s{2}\\},",
    'm',
  );
  return pattern.exec(source)?.[1] ?? null;
}

function englishXBlock() {
  return /const EN: RewardXPromotionCopy = \{([\s\S]*?)\n\};/
    .exec(xCopySource)?.[1] ?? null;
}

function hasField(block, field) {
  return new RegExp(
    '^\\s*' + field + ':\\s*[\\x27\\x22\\x60].+',
    'm',
  ).test(block);
}

function fieldToken(block, field) {
  const match = new RegExp(
    '^\\s*' + field + ':\\s*([\\x27\\x22\\x60].*[\\x27\\x22\\x60]),?$',
    'm',
  ).exec(block);
  return match?.[1] ?? null;
}

test('X promotion copy is complete and locally written for all 29 supported locales', () => {
  assert.equal(REGISTERED_LOCALES.length, 29);
  assert.doesNotMatch(xCopySource, /\.\.\.EN\b/);
  assert.doesNotMatch(expandedXCopySource, /\.\.\.EN\b/);
  const english = englishXBlock();
  assert.ok(english);
  for (const locale of REGISTERED_LOCALES) {
    const block = locale === 'en' ? english : localeBlock(allXCopySource, locale);
    assert.ok(block, 'missing X promotion copy: ' + locale);
    for (const key of X_KEYS) {
      assert.ok(hasField(block, key), locale + ' missing X promotion field ' + key);
    }
    if (locale !== 'en') {
      for (const key of BODY_KEYS) {
        assert.notEqual(
          fieldToken(block, key),
          fieldToken(english, key),
          locale + ' still falls back to English for ' + key,
        );
      }
    }
  }
});

test('X promotion locale packs stay bounded and split for maintainability', () => {
  assert.ok(xCopySource.length < 30000);
  assert.ok(expandedXCopySource.length < 30000);
  assert.match(xCopySource, /\.\.\.REWARD_X_PROMOTION_EXPANDED_COPY/);
});

test('public X campaign post remains global while in-app share labels cover every locale', () => {
  assert.match(shareSource, /export function rewardReceiptShareText\([\s\S]*locale: _locale/);
  assert.match(shareSource, /I just earned \$\{amount\} #B3TR/);
  assert.match(shareSource, /@Veinvite/);
  assert.match(shareSource, /#VeBetterDAO/);
  assert.match(shareSource, /Join\. Verify\. Earn B3TR\./);
  for (const locale of REGISTERED_LOCALES) {
    const escaped = locale.replaceAll('-', '\\-');
    assert.match(
      shareSource,
      new RegExp("(?:^|\\n)\\s*['\\\"]?" + escaped + "['\\\"]?\\s*:\\s*\\{"),
      'missing X share label: ' + locale,
    );
  }
});

test('X promotion submission errors are localized and raw API text is not rendered', () => {
  assert.doesNotMatch(submitErrorSource, /\.\.\.EN\b/);
  for (const locale of REGISTERED_LOCALES) {
    const block = localeBlock(submitErrorSource, locale);
    assert.ok(block, 'missing submit error copy: ' + locale);
    for (const key of SUBMIT_ERROR_KEYS) {
      assert.ok(hasField(block, key), locale + ' missing submit error field ' + key);
    }
  }
  assert.match(submitErrorSource, /status === 400[\s\S]*copy\.invalidPost/);
  assert.match(submitErrorSource, /status === 401 \|\| status === 403[\s\S]*copy\.walletAccess/);
  assert.match(submitErrorSource, /status === 409[\s\S]*copy\.conflict/);
  assert.match(submitErrorSource, /status === 429[\s\S]*copy\.rateLimited/);
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, 0\)/);
});

test('reward receipt copy is complete for all 29 supported locales', () => {
  assert.match(receiptCopySource, /Record<SupportedLocale, RewardReceiptCopy>/);
  for (const locale of REGISTERED_LOCALES) {
    const block = localeBlock(receiptCopySource, locale);
    assert.ok(block, 'missing reward receipt copy: ' + locale);
    for (const key of RECEIPT_KEYS) {
      assert.ok(hasField(block, key), locale + ' missing receipt field ' + key);
    }
  }
});

test('X promotion and reward receipt carry long-copy and bidi layout guards', () => {
  for (const expected of [
    'lang={locale}', 'dir={direction}', 'dir="ltr"', 'overflow-wrap:anywhere',
    'white-space:normal', 'unicode-bidi:isolate', '@media(max-width:430px)',
    'grid-template-columns:1fr',
  ]) {
    assert.ok(panelSource.includes(expected), 'missing panel layout guard: ' + expected);
  }
  for (const expected of [
    'lang={locale}', 'dir={direction}', 'notificationReceiptAmount" dir="ltr"',
    '<dd dir="ltr">#{receipt.veBetterRoundId}</dd>',
    '<dd dir="ltr">{receipt.inviteCode}</dd>', 'overflow-wrap:anywhere',
    'unicode-bidi:isolate', 'x-promotion-receipt:',
  ]) {
    assert.ok(receiptSource.includes(expected), 'missing receipt i18n guard: ' + expected);
  }
});

test('multilingual hardening preserves current X promotion lifecycle stability guards', () => {
  assert.match(panelSource, /useRef/);
  assert.match(panelSource, /requestSequenceRef/);
  assert.match(panelSource, /An open receipt may stay mounted past the 24-hour post deadline/);
  assert.match(receiptSource, /x-promotion-receipt:/);
  assert.match(receiptSource, /receipt\.id/);
});
