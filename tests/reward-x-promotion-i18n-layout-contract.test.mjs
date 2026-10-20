import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const localeSource = readFileSync(
  'src/lib/i18n/locales.ts',
  'utf8',
);
const mainCopySource = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const expandedCopySource = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopy.ts',
  'utf8',
);
const errorCopySource = readFileSync(
  'src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts',
  'utf8',
);
const panelSource = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);
const qaNotificationHarnessSource = readFileSync(
  'src/qa/QaNotificationStateHarness.tsx',
  'utf8',
);
const promotionBrowserQaSource = readFileSync(
  'tests/playwright/reward-x-promotion-locale-layout-v2.spec.ts',
  'utf8',
);
const shareSource = readFileSync(
  'src/lib/rewards/rewardReceiptShare.ts',
  'utf8',
);

const SUPPORTED_LOCALES = Array.from(
  localeSource.matchAll(/\{ locale: '([^']+)'/g),
  (match) => match[1],
);

const EXPANDED = new Set([
  'hi', 'ar', 'bn', 'sv', 'ro', 'ur', 'pcm',
  'arz', 'mr', 'te', 'sw', 'ha', 'el', 'cs',
]);

const TEXT_KEYS = [
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

function localeLabel(locale) {
  return locale.includes('-')
    ? "'" + locale + "'"
    : locale;
}

function objectBlock(source, label) {
  const marker = '\n  ' + label + ': {';
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'missing locale block: ' + label);
  const contentStart = start + marker.length;
  const end = source.indexOf('\n  },', contentStart);
  assert.ok(end > contentStart, 'unterminated locale block: ' + label);
  return source.slice(contentStart, end);
}

function englishBlock() {
  const marker = 'const EN: RewardXPromotionCopy = {';
  const start = mainCopySource.indexOf(marker);
  assert.ok(start >= 0, 'missing EN block');
  const contentStart = start + marker.length;
  const end = mainCopySource.indexOf('\n};', contentStart);
  assert.ok(end > contentStart, 'unterminated EN block');
  return mainCopySource.slice(contentStart, end);
}

function readField(block, key) {
  const line = block
    .split('\n')
    .find((value) => value.trimStart().startsWith(key + ':'));
  assert.ok(line, 'missing field ' + key);

  const match = line.match(
    /^\s*[A-Za-z][A-Za-z0-9_]*:\s*(['"])(.*)\1,?\s*$/,
  );
  assert.ok(match, 'non-string field ' + key + ': ' + line);
  return match[2];
}

function copyBlock(locale) {
  if (locale === 'en') return englishBlock();
  const source = EXPANDED.has(locale)
    ? expandedCopySource
    : mainCopySource;
  return objectBlock(source, localeLabel(locale));
}

test('X promotion copy is complete for all 29 locales without English spread fallback', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.doesNotMatch(mainCopySource, /\.\.\.EN\b/);
  assert.doesNotMatch(expandedCopySource, /\.\.\.EN\b/);

  const english = englishBlock();

  for (const locale of SUPPORTED_LOCALES) {
    const block = copyBlock(locale);

    for (const key of TEXT_KEYS) {
      assert.ok(
        readField(block, key).trim().length > 0,
        locale + ' ' + key + ' is empty',
      );
    }

    if (locale !== 'en') {
      for (const key of BODY_KEYS) {
        assert.notEqual(
          readField(block, key),
          readField(english, key),
          locale + ' still uses English for ' + key,
        );
      }
    }

    assert.ok(
      [...readField(block, 'title')].length <= 32,
      locale + ' title is unexpectedly long',
    );
    assert.ok(
      [...readField(block, 'verify')].length <= 30,
      locale + ' verify label is unexpectedly long',
    );
    assert.ok(
      [...readField(block, 'verifying')].length <= 28,
      locale + ' verifying label is unexpectedly long',
    );
    assert.ok(
      [...readField(block, 'retry')].length <= 26,
      locale + ' retry label is unexpectedly long',
    );
  }
});

test('X submit-error copy covers all locales and maps reviewed status classes', () => {
  const fields = [
    'invalidPost',
    'walletAccess',
    'conflict',
    'rateLimited',
    'unavailable',
  ];

  for (const locale of SUPPORTED_LOCALES) {
    const block = objectBlock(
      errorCopySource,
      localeLabel(locale),
    );
    for (const key of fields) {
      assert.ok(
        readField(block, key).trim().length > 0,
        locale + ' ' + key + ' is empty',
      );
    }
  }

  assert.match(errorCopySource, /status === 400/);
  assert.match(errorCopySource, /status === 401 \|\| status === 403/);
  assert.match(errorCopySource, /status === 409/);
  assert.match(errorCopySource, /status === 429/);
  assert.match(errorCopySource, /return copy\.unavailable/);

  const submitStart = panelSource.indexOf(
    'const submitPost = useCallback',
  );
  const submitEnd = panelSource.indexOf(
    '\n  if (loading)',
    submitStart,
  );
  assert.ok(submitStart >= 0 && submitEnd > submitStart);
  const submitSource = panelSource.slice(
    submitStart,
    submitEnd,
  );

  assert.match(
    submitSource,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
  assert.match(
    submitSource,
    /rewardXPromotionSubmitError\(locale, 0\)/,
  );
  assert.doesNotMatch(submitSource, /body\.error\s*\|\|/);
  assert.doesNotMatch(submitSource, /error\.message/);
  assert.doesNotMatch(
    submitSource,
    /The X Post could not be verified/,
  );
});

test('X promotion panel keeps long-copy and bidi layout guards', () => {
  for (const marker of [
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
      panelSource.includes(marker),
      'missing layout guard: ' + marker,
    );
  }

  assert.match(
    panelSource,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});

test('public X campaign template stays concise and friend-neutral', () => {
  const shareFunction = shareSource.slice(
    shareSource.indexOf(
      'export function rewardReceiptShareText',
    ),
    shareSource.indexOf(
      'export function rewardReceiptShareLabel',
    ),
  );

  assert.match(shareFunction, /#B3TR/);
  assert.match(shareFunction, /@Veinvite/);
  assert.match(shareFunction, /#VeBetterDAO/);
  assert.doesNotMatch(
    shareFunction,
    /\bfriend(?:s)?\b/i,
  );
});


test('interactive X promotion browser QA waits for React hydration before clicking receipt rows', () => {
  assert.match(
    qaNotificationHarnessSource,
    /data-qa-hydrated=\{hydrated \? 'true' : 'false'\}/,
  );
  assert.match(
    promotionBrowserQaSource,
    /\[data-qa-hydrated="true"\]/,
  );
});
