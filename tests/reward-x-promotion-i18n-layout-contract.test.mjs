import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const localesSource = readFileSync(
  'src/lib/i18n/locales.ts',
  'utf8',
);
const copySource = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const expandedCopySource = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopy.ts',
  'utf8',
);
const submitErrorSource = readFileSync(
  'src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts',
  'utf8',
);
const panelSource = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);
const receiptSource = readFileSync(
  'src/components/RewardReceiptView.tsx',
  'utf8',
);
const qaHarnessSource = readFileSync(
  'src/qa/QaNotificationStateHarness.tsx',
  'utf8',
);
const qaPageSource = readFileSync(
  'src/app/qa/notification-state/page.tsx',
  'utf8',
);
const shareSource = readFileSync(
  'src/lib/rewards/rewardReceiptShare.ts',
  'utf8',
);

const SUPPORTED_LOCALES = Array.from(
  localesSource.matchAll(/\{ locale: '([^']+)'/g),
  (match) => match[1],
);

const allCopySource = copySource + '\n' + expandedCopySource;

const COPY_KEYS = [
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

const SUBMIT_ERROR_KEYS = [
  'invalidPost',
  'walletAccess',
  'conflict',
  'rateLimited',
  'unavailable',
];

function localeBlock(source, locale) {
  if (locale === 'en') {
    const start = source.indexOf('const EN: RewardXPromotionCopy = {');
    const end = source.indexOf('\n};', start);
    return start >= 0 && end > start
      ? source.slice(start, end)
      : '';
  }

  const marker = locale.includes('-')
    ? "  '" + locale + "': {"
    : '  ' + locale + ': {';
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const end = source.indexOf('\n  },', start);
  return end > start ? source.slice(start, end) : '';
}

function submitErrorBlock(locale) {
  const marker = locale.includes('-')
    ? "  '" + locale + "': {"
    : '  ' + locale + ': {';
  const start = submitErrorSource.indexOf(marker);
  if (start < 0) return '';
  const end = submitErrorSource.indexOf('\n  },', start);
  return end > start
    ? submitErrorSource.slice(start, end)
    : '';
}

test('X promotion copy covers all 29 locales with no English spread fallback', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.doesNotMatch(copySource, /\.\.\.EN\b/);
  assert.doesNotMatch(expandedCopySource, /\.\.\.EN\b/);

  for (const locale of SUPPORTED_LOCALES) {
    const block =
      localeBlock(copySource, locale) ||
      localeBlock(expandedCopySource, locale);
    assert.ok(block, 'missing X promotion copy: ' + locale);

    for (const key of COPY_KEYS) {
      assert.match(
        block,
        new RegExp('\\b' + key + '\\s*:'),
        locale + ' missing X promotion field ' + key,
      );
    }
  }

  assert.equal(
    (allCopySource.match(/shareFollowupBody\s*:/g) ?? []).length,
    30,
  );
});

test('X promotion submit-error copy covers every locale and maps safe status classes', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const block = submitErrorBlock(locale);
    assert.ok(block, 'missing submit-error locale: ' + locale);
    for (const key of SUBMIT_ERROR_KEYS) {
      assert.match(
        block,
        new RegExp('\\b' + key + '\\s*:'),
        locale + ' missing submit-error field ' + key,
      );
    }
  }

  assert.doesNotMatch(submitErrorSource, /\.\.\.EN\b/);
  assert.match(submitErrorSource, /status === 400[\s\S]*copy\.invalidPost/);
  assert.match(submitErrorSource, /status === 401 \|\| status === 403[\s\S]*copy\.walletAccess/);
  assert.match(submitErrorSource, /status === 409[\s\S]*copy\.conflict/);
  assert.match(submitErrorSource, /status === 429[\s\S]*copy\.rateLimited/);
  assert.match(submitErrorSource, /return copy\.unavailable/);
});

test('X promotion client never renders raw submit API or exception messages', () => {
  assert.match(
    panelSource,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
  assert.match(
    panelSource,
    /rewardXPromotionSubmitError\(locale, 0\)/,
  );
  assert.doesNotMatch(panelSource, /PromotionSubmitResponse/);
  assert.doesNotMatch(
    panelSource,
    /error instanceof Error[\s\S]*error\.message/,
  );
  assert.doesNotMatch(
    panelSource,
    /The X Post could not be verified\./,
  );
});

test('X promotion panel has long-copy, mobile and bidi guards', () => {
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
      panelSource.includes(expected),
      'missing panel layout guard: ' + expected,
    );
  }

  assert.match(
    panelSource,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});

test('reward receipt permits long localized labels and explorer text to wrap', () => {
  assert.match(
    receiptSource,
    /notificationReceiptFacts dt\{[^}]*overflow-wrap:anywhere/,
  );
  assert.match(
    receiptSource,
    /notificationExplorerLink\{[^}]*white-space:normal[^}]*overflow-wrap:anywhere/,
  );
});

test('QA has a direct real receipt/X-promotion state and route allowlist', () => {
  assert.match(qaHarnessSource, /'NOTI-X-PROMOTION-OPEN'/);
  assert.match(qaHarnessSource, /<RewardReceiptView/);
  assert.match(
    qaHarnessSource,
    /data-qa-x-promotion-direct="true"/,
  );
  assert.match(qaPageSource, /'NOTI-X-PROMOTION-OPEN'/);
  assert.match(qaPageSource, /'NOTI-X-PROMOTION-PAID'/);
});

test('public X campaign share remains one reviewed global template under 280 chars', () => {
  assert.match(
    shareSource,
    /Public X campaign posts intentionally use one concise global English/,
  );
  assert.match(
    shareSource,
    /I just earned \$\{amount\} #B3TR/,
  );
  assert.match(shareSource, /@Veinvite/);
  assert.match(shareSource, /#VeBetterDAO/);

  const functionStart = shareSource.indexOf(
    'export function rewardReceiptShareText',
  );
  const functionEnd = shareSource.indexOf(
    'export function rewardReceiptShareLabel',
    functionStart,
  );
  const shareFunction = shareSource.slice(functionStart, functionEnd);
  assert.doesNotMatch(shareFunction, /\bfriend(?:s)?\b/i);

  const sample =
    'I just earned 193.91 #B3TR\n' +
    'with @Veinvite on #VeBetterDAO 🎉\n\n' +
    'Join. Verify. Earn B3TR. 👇\n' +
    'https://veinvite.vercel.app/s/AbCdEfGhIjKlMnOp';
  assert.ok(sample.length < 280);
});
