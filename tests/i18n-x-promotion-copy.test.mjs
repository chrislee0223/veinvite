import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const localesSource = readFileSync(
  'src/lib/i18n/locales.ts',
  'utf8',
);
const xCopySource = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const xExpandedSource = readFileSync(
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
const harnessSource = readFileSync(
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

const SUPPORTED_LOCALES = [
  ...localesSource.matchAll(/\{ locale: '([^']+)'/g),
].map((match) => match[1]);

const BODY_KEYS = [
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
];

const ALL_COPY_KEYS = [
  'title',
  ...BODY_KEYS,
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
}

function directLocaleBlock(source, locale) {
  const escaped = escapeRegExp(locale);
  const key = locale.includes('-')
    ? "'" + escaped + "'"
    : "(?:'" + escaped + "'|" + escaped + ")";
  return source.match(
    new RegExp(
      "(?:^|\\n)\\s*" + key + "\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\},",
      'm',
    ),
  )?.[1] ?? null;
}

function englishBlock() {
  return xCopySource.match(
    /const EN: RewardXPromotionCopy = \{([\s\S]*?)\n\};/,
  )?.[1] ?? null;
}

function xLocaleBlock(locale) {
  if (locale === 'en') return englishBlock();
  return (
    directLocaleBlock(xCopySource, locale) ??
    directLocaleBlock(xExpandedSource, locale)
  );
}

function fieldValue(block, key) {
  if (!block) return null;
  const match = block.match(
    new RegExp(
      "(?:^|\\n)\\s*" +
        escapeRegExp(key) +
        "\\s*:\\s*'((?:\\\\'|[^'])*)'",
      'm',
    ),
  );
  return match?.[1] ?? null;
}

test('X promotion copy is complete for all 29 supported locales with no English body fallback', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.doesNotMatch(xCopySource, /\.\.\.EN\b/);
  assert.doesNotMatch(xExpandedSource, /\.\.\.EN\b/);
  assert.match(
    xCopySource,
    /\.\.\.REWARD_X_PROMOTION_EXPANDED_COPY/,
  );

  const english = xLocaleBlock('en');
  assert.ok(english);

  for (const locale of SUPPORTED_LOCALES) {
    const block = xLocaleBlock(locale);
    assert.ok(block, 'missing X promotion copy: ' + locale);

    for (const key of ALL_COPY_KEYS) {
      const value = fieldValue(block, key);
      assert.ok(
        value !== null && value.trim().length > 0,
        locale + ' ' + key + ' is missing or empty',
      );
    }

    if (locale !== 'en') {
      for (const key of BODY_KEYS) {
        assert.notEqual(
          fieldValue(block, key),
          fieldValue(english, key),
          locale + ' still falls back to English for ' + key,
        );
      }
    }
  }
});

test('localized X promotion controls stay within wrapped mobile-label bounds', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const block = xLocaleBlock(locale);
    assert.ok(block);

    for (const [key, max] of [
      ['title', 30],
      ['verify', 28],
      ['verifying', 24],
      ['retry', 24],
    ]) {
      const value = fieldValue(block, key);
      assert.ok(value, locale + ' ' + key + ' missing');
      assert.ok(
        [...value].length <= max,
        locale + ' ' + key + ' unexpectedly long',
      );
    }
  }
});

test('X promotion submit errors are localized and raw API messages never reach UI', () => {
  const english = directLocaleBlock(submitErrorSource, 'en');
  assert.ok(english);

  for (const locale of SUPPORTED_LOCALES) {
    const block = directLocaleBlock(submitErrorSource, locale);
    assert.ok(block, 'missing submit error copy: ' + locale);

    for (const key of SUBMIT_ERROR_KEYS) {
      const value = fieldValue(block, key);
      assert.ok(
        value !== null && value.trim().length > 0,
        locale + ' ' + key + ' missing',
      );
      if (locale !== 'en') {
        assert.notEqual(
          value,
          fieldValue(english, key),
          locale + ' still uses English submit error for ' + key,
        );
      }
    }
  }

  const submitStart = panelSource.indexOf(
    'const submitPost = useCallback(async () => {',
  );
  const submitEnd = panelSource.indexOf(
    '\n  if (loading) {',
    submitStart,
  );
  assert.ok(submitStart >= 0 && submitEnd > submitStart);
  const submitSource = panelSource.slice(submitStart, submitEnd);

  assert.match(
    submitSource,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
  assert.match(
    submitSource,
    /rewardXPromotionSubmitError\(locale, 0\)/,
  );
  assert.doesNotMatch(submitSource, /body\.error\s*\|\|/);
  assert.doesNotMatch(
    submitSource,
    /error instanceof Error[\s\S]*error\.message/,
  );
});

test('X promotion panel keeps long and RTL copy inside safe mobile geometry', () => {
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
      panelSource.includes(expected),
      'missing panel layout guard: ' + expected,
    );
  }

  assert.match(
    panelSource,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});

test('reward receipt explorer link can wrap instead of overflowing translated mobile UI', () => {
  assert.match(
    receiptSource,
    /\.notificationExplorerLink\{[^}]*flex-wrap:wrap[^}]*white-space:normal[^}]*overflow-wrap:anywhere/,
  );
});

test('X promotion browser QA uses a dedicated direct-render receipt state', () => {
  assert.match(
    harnessSource,
    /\| 'NOTI-X-PROMOTION-PANEL'/,
  );
  assert.match(
    harnessSource,
    /stateId === 'NOTI-X-PROMOTION-PANEL'[\s\S]*<RewardReceiptView/,
  );
  assert.match(
    harnessSource,
    /data-qa-x-promotion-panel="true"/,
  );
  assert.match(
    harnessSource,
    /data-qa-x-promotion-hydrated=\{hydrated \? 'true' : 'false'\}/,
  );
  assert.match(
    harnessSource,
    /hydrated \? \([\s\S]*<RewardReceiptView/,
  );
  assert.match(
    qaPageSource,
    /'NOTI-X-PROMOTION-PANEL'/,
  );
});

test('public X campaign post stays intentionally global and friend-neutral', () => {
  const fn = shareSource.slice(
    shareSource.indexOf('export function rewardReceiptShareText'),
    shareSource.indexOf('export function rewardReceiptShareLabel'),
  );
  assert.match(fn, /locale: _locale/);
  assert.match(fn, /with @Veinvite on #VeBetterDAO/);
  assert.match(fn, /Join\. Verify\. Earn B3TR\./);
  assert.doesNotMatch(fn, /\bfriend(?:s)?\b/i);
});
