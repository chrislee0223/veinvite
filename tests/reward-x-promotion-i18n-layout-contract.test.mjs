import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const locales = read('src/lib/i18n/locales.ts');
const copy = read('src/lib/i18n/rewardXPromotionCopy.ts');
const expanded = read('src/lib/i18n/rewardXPromotionExpandedCopy.ts');
const coreAuto = read('src/lib/i18n/rewardXPromotionCoreAutoCopy.ts');
const submitErrors = read('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts');
const panel = read('src/components/RewardXPromotionPanel.tsx');
const receipt = read('src/components/RewardReceiptView.tsx');
const qaHarness = read('src/qa/QaNotificationStateHarness.tsx');
const preview = read('src/components/NotificationUiPreview.tsx');

const supported = [...locales.matchAll(/\{ locale: '([^']+)'/g)].map(
  (match) => match[1],
);

test('X promotion localization covers all 29 locales without English fallback spreads', () => {
  assert.equal(supported.length, 29);
  assert.equal(new Set(supported).size, 29);
  assert.doesNotMatch(copy, /\.\.\.EN\b/);
  assert.match(copy, /\.\.\.REWARD_X_PROMOTION_EXPANDED_COPY/);
  assert.match(copy, /REWARD_X_PROMOTION_CORE_AUTO_COPY/);

  for (const field of [
    'connectX',
    'connectedX',
    'autoConnectBody',
    'autoOpenBody',
    'autoGraceBody',
    'autoConnectedX',
  ]) {
    assert.match(
      copy,
      new RegExp(field + ': string;'),
      field + ' must stay required',
    );
    assert.doesNotMatch(
      copy,
      new RegExp(field + '\\?: string;'),
      field + ' must not become optional',
    );
  }
});

test('expanded locale pack contains every X promotion field explicitly', () => {
  const localesToCheck = [
    'hi', 'ar', 'bn', 'sv', 'ro', 'ur', 'pcm',
    'arz', 'mr', 'te', 'sw', 'ha', 'el', 'cs',
  ];
  const fields = [
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
    'autoGraceBody',
    'autoConnectedX',
  ];

  for (const locale of localesToCheck) {
    const key = locale.includes('-') ? "'" + locale + "'" : locale;
    const start = expanded.indexOf('  ' + key + ': {');
    assert.ok(start >= 0, 'missing expanded locale ' + locale);
    const next = expanded.indexOf('\n  },', start);
    const block = expanded.slice(start, next + 5);
    for (const field of fields) {
      assert.match(block, new RegExp('\\b' + field + '\\s*:'), locale + ' missing ' + field);
    }
  }
});

test('core auto-discovery pack covers every previously incomplete locale', () => {
  const coreLocales = [
    'zh', 'zh-tw', 'ja', 'es', 'de', 'fr', 'it',
    'tr', 'nl', 'pt', 'ru', 'id', 'vi',
  ];
  for (const locale of coreLocales) {
    const escaped = locale.replace('-', '\\-');
    const key = locale.includes('-')
      ? "'" + escaped + "'"
      : escaped;
    assert.match(
      coreAuto,
      new RegExp('(?:^|\\n)\\s*' + key + '\\s*:', 'm'),
      'missing core auto copy for ' + locale,
    );
  }
  for (const field of [
    'connectX',
    'connectedX',
    'autoConnectBody',
    'autoOpenBody',
    'autoGraceBody',
    'autoConnectedX',
  ]) {
    const count = (coreAuto.match(new RegExp('\\b' + field + '\\s*:', 'g')) ?? []).length;
    assert.equal(count, coreLocales.length, field + ' must exist for every core auto locale');
  }
});

test('X promotion submit errors are localized and raw API messages never render', () => {
  for (const locale of supported) {
    const key = locale.includes('-') ? "'" + locale + "'" : locale;
    assert.match(
      submitErrors,
      new RegExp('(?:^|\\n)\\s*' + key.replace('-', '\\-') + '\\s*:', 'm'),
      'missing submit error copy for ' + locale,
    );
  }

  assert.match(panel, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panel, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(panel, /body\.error\s*\|\|/);
  assert.doesNotMatch(panel, /error instanceof Error[\s\S]*error\.message/);
  assert.doesNotMatch(panel, /The X Post could not be verified\./);
});

test('X promotion layout has bidi and long-copy guards', () => {
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
    assert.ok(panel.includes(expected), 'missing layout guard: ' + expected);
  }

  assert.match(
    panel,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
  assert.match(receipt, /notificationExplorerLink[\s\S]*overflow-wrap:anywhere/);
});

test('QA exposes a direct X promotion layout state without receipt-click dependency', () => {
  assert.match(qaHarness, /'NOTI-X-PROMOTION-LAYOUT'/);
  assert.match(qaHarness, /data-testid="qa-x-promotion-layout"/);
  assert.match(qaHarness, /<RewardReceiptView/);
  assert.match(preview, /NOTI-X-PROMOTION-LAYOUT/);
});
