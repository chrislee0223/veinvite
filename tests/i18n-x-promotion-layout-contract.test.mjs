import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const localesSource = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const coreCopy = readFileSync('src/lib/i18n/rewardXPromotionCopy.ts', 'utf8');
const expandedCopy = readFileSync('src/lib/i18n/rewardXPromotionExpandedCopy.ts', 'utf8');
const errorCopy = readFileSync('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts', 'utf8');
const panel = readFileSync('src/components/RewardXPromotionPanel.tsx', 'utf8');
const receipt = readFileSync('src/components/RewardReceiptView.tsx', 'utf8');
const qa = readFileSync('src/qa/QaNotificationStateHarness.tsx', 'utf8');
const preview = readFileSync('src/components/NotificationUiPreview.tsx', 'utf8');

const supportedLocales = [...localesSource.matchAll(/\{ locale: '([^']+)'/g)]
  .map((match) => match[1]);

function localeBlockPattern(locale) {
  return new RegExp("(?:^|\\n)\\s*(?:'" + locale + "'|" + locale + "):\\s*\\{", 'm');
}

test('X promotion copy covers all 29 supported locales without English body fallback', () => {
  assert.equal(supportedLocales.length, 29);
  assert.equal(new Set(supportedLocales).size, supportedLocales.length);
  assert.doesNotMatch(coreCopy + expandedCopy, /\.\.\.EN\b/);
  assert.match(coreCopy, /en:\s*EN/);

  for (const locale of supportedLocales) {
    if (locale === 'en') continue;
    assert.ok(
      localeBlockPattern(locale).test(coreCopy + expandedCopy),
      'missing X promotion copy for ' + locale,
    );
  }
});

test('X promotion request errors have explicit localized copy for every locale', () => {
  for (const locale of supportedLocales) {
    assert.ok(
      localeBlockPattern(locale).test(errorCopy),
      'missing X promotion error copy for ' + locale,
    );
  }

  assert.doesNotMatch(errorCopy, /\.\.\.EN\b/);
  for (const key of [
    'invalidPost',
    'walletAccess',
    'conflict',
    'rateLimited',
    'unavailable',
  ]) {
    assert.match(errorCopy, new RegExp('\\b' + key + ':'));
  }
});

test('X promotion panel keeps localized UI, RTL direction and LTR technical values isolated', () => {
  for (const expected of [
    'getLocaleDirection',
    'lang={locale}',
    'dir={direction}',
    '<span dir="ltr">+{promotion.amountB3tr} B3TR</span>',
    '<b dir="ltr">+{promotion.amountB3tr} B3TR</b>',
    'dir="ltr"',
    'overflow-wrap:anywhere',
    'white-space:normal',
    'unicode-bidi:isolate',
    '@media(max-width:430px)',
  ]) {
    assert.ok(panel.includes(expected), 'missing X promotion layout guard: ' + expected);
  }

  assert.match(
    panel,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
  assert.match(
    panel,
    /rewardXPromotionSubmitError\(locale, 0\)/,
  );
  assert.doesNotMatch(
    panel,
    /setSubmitError\([\s\S]{0,220}body\.error/,
  );
  assert.doesNotMatch(
    panel,
    /error instanceof Error[\s\S]{0,160}error\.message/,
  );
});

test('receipt and QA harness protect long localized X promotion surfaces', () => {
  assert.match(
    receipt,
    /\.notificationExplorerLink\{[\s\S]*min-width:0[\s\S]*white-space:normal[\s\S]*overflow-wrap:anywhere/,
  );
  assert.match(qa, /\| 'NOTI-X-PROMOTION-PANEL'/);
  assert.match(
    qa,
    /stateId === 'NOTI-X-PROMOTION-PANEL'[\s\S]*data-qa-notification-ready="true"[\s\S]*<RewardReceiptView/,
  );
  assert.match(
    preview,
    /NOTI-X-PROMOTION-PANEL/,
  );
});
