import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const locales = read('src/lib/i18n/locales.ts');
const copy = read('src/lib/i18n/rewardXPromotionCopy.ts');
const expanded = read('src/lib/i18n/rewardXPromotionExpandedCopy.ts');
const auto = read('src/lib/i18n/rewardXPromotionAutoCopy.ts');
const autoCore = read('src/lib/i18n/rewardXPromotionAutoCopyCore.ts');
const autoExpanded = read('src/lib/i18n/rewardXPromotionAutoCopyExpanded.ts');
const submitErrors = read('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts');
const panel = read('src/components/RewardXPromotionPanel.tsx');
const share = read('src/lib/rewards/rewardReceiptShare.ts');
const harness = read('src/qa/QaNotificationStateHarness.tsx');
const qaPage = read('src/app/qa/notification-state/page.tsx');
const preview = read('src/components/NotificationUiPreview.tsx');
const receipt = read('src/components/RewardReceiptView.tsx');

const supportedLocales = [
  ...locales.matchAll(/\{ locale: '([^']+)'/g),
].map((match) => match[1]);

const localeKeys = (source) => [
  ...source.matchAll(
    /^\s*(?:'([^']+)'|([a-z]+)):\s*\{/gmu,
  ),
]
  .map((match) => match[1] ?? match[2])
  .filter((locale) => supportedLocales.includes(locale));

test('X promotion localization covers all 29 supported locales without English body spreading', () => {
  assert.equal(supportedLocales.length, 29);
  assert.equal(new Set(supportedLocales).size, 29);

  assert.deepEqual(
    [...new Set([
      ...localeKeys(autoCore),
      ...localeKeys(autoExpanded),
    ])].sort(),
    [...supportedLocales].sort(),
  );
  assert.deepEqual(
    [...new Set(localeKeys(submitErrors))].sort(),
    [...supportedLocales].sort(),
  );

  assert.deepEqual(
    [...new Set(localeKeys(expanded))].sort(),
    [
      'ar', 'arz', 'bn', 'cs', 'el', 'ha', 'hi',
      'mr', 'pcm', 'ro', 'sv', 'sw', 'te', 'ur',
    ],
  );

  assert.doesNotMatch(copy, /\.\.\.EN\b/);
  assert.match(copy, /REWARD_X_PROMOTION_EXPANDED_COPY/);
  assert.match(copy, /REWARD_X_PROMOTION_AUTO_COPY/);
  assert.match(
    auto,
    /REWARD_X_PROMOTION_AUTO_CORE_COPY[\s\S]*REWARD_X_PROMOTION_AUTO_EXPANDED_COPY/,
  );
  assert.match(
    copy,
    /\.\.\.copy,[\s\S]*\.\.\.REWARD_X_PROMOTION_AUTO_COPY\[locale\]/,
  );
});

test('X promotion translation source files stay below the codebase large-file guard', () => {
  for (const [name, source] of [
    ['copy', copy],
    ['expanded', expanded],
    ['auto', auto],
    ['autoCore', autoCore],
    ['autoExpanded', autoExpanded],
    ['submitErrors', submitErrors],
  ]) {
    assert.ok(
      Buffer.byteLength(source, 'utf8') < 30_000,
      name + ' unexpectedly exceeds the 30 KB source-file guard',
    );
  }
});

test('X promotion panel never falls back to English UI copy or raw submit API errors', () => {
  assert.doesNotMatch(panel, /REWARD_X_PROMOTION_COPY\.en/);

  const submitStart = panel.indexOf(
    'const submitPost = useCallback',
  );
  const submitEnd = panel.indexOf(
    'if (loading)',
    submitStart,
  );
  assert.ok(submitStart >= 0 && submitEnd > submitStart);
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
  assert.doesNotMatch(
    submitBlock,
    /The X Post could not be verified\./,
  );
});

test('X promotion panel has explicit bidi and long-copy layout guards', () => {
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
    assert.ok(
      panel.includes(expected),
      'missing X promotion layout guard: ' + expected,
    );
  }

  assert.match(
    panel,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
  assert.match(
    receipt,
    /notificationExplorerLink[\s\S]*white-space:normal[\s\S]*overflow-wrap:anywhere/,
  );
});

test('dedicated QA state renders the real X promotion panel directly', () => {
  assert.match(
    harness,
    /'NOTI-X-PROMOTION-PANEL'/,
  );
  assert.match(
    harness,
    /<RewardXPromotionPanel[\s\S]*inviteCode="QA-X-PROMOTION-22"/,
  );
  assert.match(
    harness,
    /data-testid="qa-x-promotion-panel"/,
  );
  assert.match(
    qaPage,
    /'NOTI-X-PROMOTION-PANEL'/,
  );
  assert.match(
    preview,
    /'NOTI-X-PROMOTION-PANEL'/,
  );
});

test('public X campaign post remains one reviewed global template while in-app labels localize', () => {
  const start = share.indexOf(
    'export function rewardReceiptShareText',
  );
  const end = share.indexOf(
    'export function rewardReceiptShareLabel',
    start,
  );
  assert.ok(start >= 0 && end > start);
  const shareBlock = share.slice(start, end);

  assert.match(shareBlock, /I just earned \$\{amount\} #B3TR/);
  assert.match(shareBlock, /with @Veinvite on #VeBetterDAO/);
  assert.match(shareBlock, /Join\. Verify\. Earn B3TR\./);
  assert.doesNotMatch(shareBlock, /\bfriend(?:s)?\b/i);
  assert.match(
    share,
    /return REWARD_RECEIPT_SHARE_COPY\[locale\]\.label/,
  );
});
