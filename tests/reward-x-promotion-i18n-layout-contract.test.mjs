import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
const share = readFileSync(
  'src/lib/rewards/rewardReceiptShare.ts',
  'utf8',
);
const receiptCopy = readFileSync(
  'src/lib/i18n/rewardReceiptCopy.ts',
  'utf8',
);
const receiptView = readFileSync(
  'src/components/RewardReceiptView.tsx',
  'utf8',
);

test('X promotion copy has no English spread fallback', () => {
  assert.doesNotMatch(coreCopy, /\.\.\.EN\b/);
  assert.match(
    coreCopy,
    /\.\.\.REWARD_X_PROMOTION_EXPANDED_COPY/,
  );

  for (const locale of [
    'hi', 'ar', 'bn', 'sv', 'ro', 'ur', 'pcm',
    'arz', 'mr', 'te', 'sw', 'ha', 'el', 'cs',
  ]) {
    assert.match(
      expandedCopy,
      new RegExp("(?:^|\\n)\\s*(?:'" + locale + "'|" + locale + "):\\s*\\{", 'm'),
      'missing expanded locale: ' + locale,
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
    'verify',
    'verifying',
    'retry',
  ]) {
    const matches =
      expandedCopy.match(new RegExp('\\b' + key + ':', 'g')) ?? [];
    assert.equal(
      matches.length,
      14,
      key + ' must exist for every expanded locale',
    );
  }
});

test('X promotion submit errors are localized without raw API leakage', () => {
  for (const locale of [
    'en','ko','zh','zh-tw','ja','es','de','fr','it','tr','nl','pt','ru',
    'id','vi','hi','ar','bn','sv','ro','ur','pcm','arz','mr','te','sw',
    'ha','el','cs',
  ]) {
    assert.match(
      submitErrors,
      new RegExp("(?:^|\\n)\\s*(?:'" + locale.replace('-', '\\-') + "'|" + locale.replace('-', '\\-') + "):\\s*\\{", 'm'),
      'missing submit error locale: ' + locale,
    );
  }

  const submitSection = panel.slice(
    panel.indexOf('const submitPost = useCallback'),
    panel.indexOf('if (loading)', panel.indexOf('const submitPost = useCallback')),
  );
  assert.match(
    submitSection,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
  assert.match(
    submitSection,
    /rewardXPromotionSubmitError\(locale, 0\)/,
  );
  assert.doesNotMatch(submitSection, /body\.error\s*\|\|/);
  assert.doesNotMatch(
    submitSection,
    /error instanceof Error[\s\S]*error\.message/,
  );
  assert.doesNotMatch(
    submitSection,
    /The X Post could not be verified\./,
  );
});

test('X promotion panel keeps long and RTL copy layout-safe', () => {
  for (const expected of [
    'getLocaleDirection',
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

test('public X campaign post stays friend-neutral and under the reviewed format', () => {
  const publicFunction = share.slice(
    share.indexOf('export function rewardReceiptShareText'),
    share.indexOf('export function rewardReceiptShareLabel'),
  );

  assert.match(publicFunction, /@Veinvite/);
  assert.match(publicFunction, /#B3TR/);
  assert.match(publicFunction, /#VeBetterDAO/);
  assert.match(publicFunction, /Join\. Verify\. Earn B3TR\./);
  assert.doesNotMatch(publicFunction, /\bfriend(?:s)?\b/i);
});


test('reward receipt copy covers every supported locale with no fallback gap', () => {
  assert.match(
    receiptCopy,
    /Record<SupportedLocale, RewardReceiptCopy>/,
  );

  for (const locale of [
    'en','ko','zh','zh-tw','ja','es','de','fr','it','tr','nl','pt','ru',
    'id','vi','hi','ar','bn','sv','ro','ur','pcm','arz','mr','te','sw',
    'ha','el','cs',
  ]) {
    assert.match(
      receiptCopy,
      new RegExp("(?:^|\\n)\\s*(?:'" + locale.replace('-', '\\-') + "'|" + locale.replace('-', '\\-') + "):\\s*\\{", 'm'),
      'missing reward receipt locale: ' + locale,
    );
  }

  for (const key of [
    'eyebrow',
    'title',
    'description',
    'round',
    'invite',
    'transaction',
    'viewTransaction',
    'acknowledge',
    'acknowledging',
    'error',
  ]) {
    const matches =
      receiptCopy.match(new RegExp('\\b' + key + ':', 'g')) ?? [];
    assert.equal(
      matches.length,
      29,
      key + ' must exist for every reward receipt locale',
    );
  }
});

test('reward receipt layout isolates identifiers and wraps long localized labels', () => {
  assert.match(
    receiptView,
    /notificationReceiptAmount" dir="ltr"/,
  );
  assert.match(
    receiptView,
    /<dd dir="ltr">#\{receipt\.veBetterRoundId\}<\/dd>/,
  );
  assert.match(
    receiptView,
    /<dd dir="ltr">\{receipt\.inviteCode\}<\/dd>/,
  );
  assert.match(
    receiptView,
    /<dd title=\{receipt\.txId\} dir="ltr">/,
  );

  for (const expected of [
    'overflow-wrap:break-word',
    'overflow-wrap:anywhere',
    'unicode-bidi:isolate',
    'max-width:62%',
    'notificationExplorerLink span:first-child',
  ]) {
    assert.ok(
      receiptView.includes(expected),
      'missing reward receipt layout guard: ' + expected,
    );
  }
});
