import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const locales = read('src/lib/i18n/locales.ts');
const mainCopy = read('src/lib/i18n/rewardXPromotionCopy.ts');
const expandedCopy = read('src/lib/i18n/rewardXPromotionExpandedCopy.ts');
const submitErrors = read('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts');
const panel = read('src/components/RewardXPromotionPanel.tsx');
const receipt = read('src/components/RewardReceiptView.tsx');
const qaHarness = read('src/qa/QaNotificationStateHarness.tsx');
const qaPage = read('src/app/qa/notification-state/page.tsx');
const qaPreview = read('src/components/NotificationUiPreview.tsx');

const supportedLocales = [...locales.matchAll(/\{ locale: '([^']+)'/g)]
  .map((match) => match[1]);

const expandedLocales = [
  'hi', 'ar', 'bn', 'sv', 'ro', 'ur', 'pcm',
  'arz', 'mr', 'te', 'sw', 'ha', 'el', 'cs',
];

const promotionFields = [
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

const errorFields = [
  'invalidPost',
  'walletAccess',
  'conflict',
  'rateLimited',
  'unavailable',
];

function localeBlock(source, locale) {
  const matcher = new RegExp(
    "(?:^|\\n)\\s*(?:'" + locale + "'|" + locale + "):\\s*\\{([\\s\\S]*?)\\n\\s*\\},",
    'm',
  );
  return source.match(matcher)?.[1] ?? '';
}

test('X promotion copy removes English fallback bodies and covers all 29 locales', () => {
  assert.equal(supportedLocales.length, 29);
  assert.doesNotMatch(mainCopy, /\.\.\.EN\b/);
  assert.doesNotMatch(expandedCopy, /\.\.\.EN\b/);
  assert.match(mainCopy, /\.\.\.REWARD_X_PROMOTION_EXPANDED_COPY/);

  for (const locale of expandedLocales) {
    const block = localeBlock(expandedCopy, locale);
    assert.ok(block, 'missing expanded X promotion locale: ' + locale);
    for (const field of promotionFields) {
      assert.match(
        block,
        new RegExp('\\b' + field + '\\s*:'),
        locale + ' is missing ' + field,
      );
    }
  }

  for (const locale of supportedLocales) {
    if (locale === 'en') {
      assert.match(mainCopy, /\ben:\s*EN,/);
      continue;
    }
    if (expandedLocales.includes(locale)) continue;
    assert.ok(
      localeBlock(mainCopy, locale),
      'missing primary X promotion locale: ' + locale,
    );
  }
});

test('localized submit errors cover every supported locale and status family', () => {
  const declared = [
    ...submitErrors.matchAll(/^\s*(?:'([^']+)'|([a-z]+)):\s*\{/gmu),
  ]
    .map((match) => match[1] ?? match[2])
    .filter((locale) => supportedLocales.includes(locale));

  assert.deepEqual(
    [...new Set(declared)].sort(),
    [...supportedLocales].sort(),
  );
  assert.equal(declared.length, supportedLocales.length);

  for (const locale of supportedLocales) {
    const block = localeBlock(submitErrors, locale);
    assert.ok(block, 'missing submit error locale: ' + locale);
    for (const field of errorFields) {
      assert.match(
        block,
        new RegExp('\\b' + field + '\\s*:'),
        locale + ' is missing submit error ' + field,
      );
    }
  }

  assert.match(submitErrors, /status === 400/);
  assert.match(submitErrors, /status === 401 \|\| status === 403/);
  assert.match(submitErrors, /status === 409/);
  assert.match(submitErrors, /status === 429/);
});

test('X promotion panel keeps server errors private and renders localized safe errors', () => {
  const submitStart = panel.indexOf('const submitPost = useCallback');
  const submitEnd = panel.indexOf('\n  if (loading)', submitStart);
  const submitBlock = panel.slice(submitStart, submitEnd);

  assert.match(
    submitBlock,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
  assert.match(
    submitBlock,
    /rewardXPromotionSubmitError\(locale, 0\)/,
  );
  assert.doesNotMatch(submitBlock, /body\.error/);
  assert.doesNotMatch(submitBlock, /error\.message/);
  assert.doesNotMatch(submitBlock, /The X Post could not be verified/);
});

test('X promotion panel guards long translations and mixed RTL/LTR content', () => {
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
  assert.match(
    receipt,
    /\.notificationExplorerLink\{[^}]*white-space:normal[^}]*overflow-wrap:anywhere/,
  );
});

test('QA exposes a direct real X promotion receipt state for browser layout auditing', () => {
  for (const source of [qaHarness, qaPage, qaPreview]) {
    assert.match(source, /NOTI-X-PROMOTION-OPEN/);
  }
  assert.match(qaHarness, /<RewardReceiptView/);
  assert.match(qaHarness, /data-testid="qa-x-promotion-receipt"/);
  assert.match(qaHarness, /qa-reward-share-preview/);
});
