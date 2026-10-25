import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  rewardReceiptShareLabel,
  rewardReceiptShareText,
  rewardReceiptXIntentUrl,
} from '../src/lib/rewards/rewardReceiptShare.ts';

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
const xAutoCoreSource = readFileSync(
  'src/lib/i18n/rewardXPromotionAutoCoreCopy.ts',
  'utf8',
);
const xAutoExpandedSource = readFileSync(
  'src/lib/i18n/rewardXPromotionAutoExpandedCopy.ts',
  'utf8',
);
const xAutoRegistrySource = readFileSync(
  'src/lib/i18n/rewardXPromotionAutoCopy.ts',
  'utf8',
);
const panelSource = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);
const submitErrorSource = readFileSync(
  'src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts',
  'utf8',
);
const notificationSurfaceSource = readFileSync(
  'src/components/InviteNotificationSurfaceV2.tsx',
  'utf8',
);
const notificationHistorySource = readFileSync(
  'src/components/UnifiedInviteNotificationHistoryCenter.tsx',
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

const AUTO_COPY_KEYS = [
  'connectX',
  'connectedX',
  'autoConnectBody',
  'autoOpenBody',
  'autoShareFollowupBody',
  'autoGraceBody',
  'autoConnectedX',
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


function autoLocaleBlock(locale) {
  return (
    directLocaleBlock(xAutoCoreSource, locale) ??
    directLocaleBlock(xAutoExpandedSource, locale)
  );
}

function fieldValue(block, key) {
  if (!block) return null;
  const match = block.match(
    new RegExp(
      "(?:^|\\n)\\s*" +
        escapeRegExp(key) +
        "\\s*:\\s*'([^']*)'",
      'm',
    ),
  );
  return match?.[1] ?? null;
}

test('X promotion copy is complete and locally written for all supported locales', () => {
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


test('automatic X account and post-discovery copy is explicit in all supported locales', () => {
  assert.match(
    xAutoRegistrySource,
    /\.\.\.REWARD_X_PROMOTION_AUTO_CORE_COPY/,
  );
  assert.match(
    xAutoRegistrySource,
    /\.\.\.REWARD_X_PROMOTION_AUTO_EXPANDED_COPY/,
  );

  const english = autoLocaleBlock('en');
  assert.ok(english);
  assert.doesNotMatch(xAutoCoreSource, /\.\.\.EN\b/);
  assert.doesNotMatch(xAutoExpandedSource, /\.\.\.EN\b/);

  for (const locale of SUPPORTED_LOCALES) {
    const block = autoLocaleBlock(locale);
    assert.ok(block, 'missing automatic X copy: ' + locale);

    for (const key of AUTO_COPY_KEYS) {
      const value = fieldValue(block, key);
      assert.ok(
        value !== null && value.trim().length > 0,
        locale + ' ' + key + ' is missing or empty',
      );
    }
  }
});

test('localized X promotion controls stay compact enough for wrapped mobile UI', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const block = xLocaleBlock(locale);
    assert.ok(block, 'missing X promotion block: ' + locale);

    for (const [key, max] of [
      ['title', 30],
      ['verify', 28],
      ['verifying', 24],
      ['retry', 24],
    ]) {
      const value = fieldValue(block, key);
      assert.ok(value, locale + ' ' + key + ' is missing');
      assert.ok(
        [...value].length <= max,
        locale + ' ' + key + ' is unexpectedly long',
      );
    }

    const shareLabel = rewardReceiptShareLabel(locale);
    assert.ok(shareLabel.trim().length > 0, locale + ' X share label is empty');
    assert.ok([...shareLabel].length <= 24, locale + ' X share label is unexpectedly long');
  }
});

test('public X post stays intentionally global while localized UI labels vary', () => {
  const baseline = rewardReceiptShareText({
    locale: 'en',
    amountB3tr: '193.91',
  });

  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(
      rewardReceiptShareText({
        locale,
        amountB3tr: '193.91',
      }),
      baseline,
      locale + ' changed the reviewed global X campaign post',
    );

    const intent = new URL(rewardReceiptXIntentUrl({
      locale,
      amountB3tr: '193.91',
      referralUrl: 'https://veinvite.vercel.app/s/AbCdEfGhIjKlMnOp',
    }));
    const text = intent.searchParams.get('text') ?? '';
    assert.ok(text.length < 280, locale + ' X intent exceeds 280 characters');
    assert.match(text, /@Veinvite/);
    assert.doesNotMatch(text, /\bfriend(?:s)?\b/i);
    assert.match(text, /#B3TR/);
    assert.match(text, /#VeBetterDAO/);
  }
});

test('X promotion panel has long-copy and bidi layout guards', () => {
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
    assert.ok(panelSource.includes(expected), 'missing panel layout guard: ' + expected);
  }

  assert.match(
    panelSource,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});

test('X promotion submission errors are localized for all supported locales', () => {
  const english = directLocaleBlock(submitErrorSource, 'en');
  assert.ok(english);

  for (const locale of SUPPORTED_LOCALES) {
    const block = directLocaleBlock(submitErrorSource, locale);
    assert.ok(block, 'missing submit error copy: ' + locale);

    for (const key of SUBMIT_ERROR_KEYS) {
      const value = fieldValue(block, key);
      assert.ok(
        value !== null && value.trim().length > 0,
        locale + ' ' + key + ' is missing or empty',
      );
      if (locale !== 'en') {
        assert.notEqual(
          value,
          fieldValue(english, key),
          locale + ' still uses the English submit error for ' + key,
        );
      }
    }
  }

  assert.doesNotMatch(submitErrorSource, /\.\.\.EN\b/);
  assert.match(submitErrorSource, /if \(status === 400\) return copy\.invalidPost;/);
  assert.match(submitErrorSource, /if \(status === 401 \|\| status === 403\) return copy\.walletAccess;/);
  assert.match(submitErrorSource, /if \(status === 409 \|\| status === 422\) return copy\.conflict;/);
  assert.match(submitErrorSource, /if \(status === 429\) return copy\.rateLimited;/);
  assert.match(submitErrorSource, /return copy\.unavailable;/);
});

test('X promotion submit path never renders raw API or network error messages', () => {
  const submitStart = panelSource.indexOf(
    'const submitPost = useCallback(async () => {',
  );
  const submitEnd = panelSource.indexOf(
    '\n  if (loading) {',
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
  assert.doesNotMatch(
    submitSource,
    /error instanceof Error[\s\S]*error\.message/,
  );
  assert.doesNotMatch(
    submitSource,
    /The X Post could not be verified\./,
  );
});

test('complex-script X promotion copy gets readable line boxes without shrinking content', () => {
  for (const locale of ['ar', 'arz', 'ur', 'hi', 'bn', 'mr', 'te']) {
    assert.ok(
      panelSource.includes("[lang='" + locale + "']"),
      'missing complex-script layout guard: ' + locale,
    );
  }
  assert.match(
    panelSource,
    /\.promotionPanel:is\([^)]*\) \.promotionHeading strong\{font-size:\.74rem;line-height:1\.55\}/,
  );
  assert.match(
    panelSource,
    /\.promotionPanel:is\([^)]*\) p\{font-size:\.66rem;line-height:1\.62\}/,
  );
  assert.match(
    panelSource,
    /\.promotionPanel\[lang='ur'\] p\{line-height:1\.72\}/,
  );
});


test('notification B3TR amounts stay LTR-isolated inside RTL locales', () => {
  assert.match(
    notificationSurfaceSource,
    /className="rewardAmount" dir="ltr"/,
  );
  assert.match(
    notificationSurfaceSource,
    /\.rewardAmount[^}]*unicode-bidi:isolate/,
  );
  assert.match(
    notificationHistorySource,
    /effectiveKind === 'X_PROMOTION_PAID'/,
  );
  assert.match(
    notificationHistorySource,
    /<b dir=\{hintIsTechnical \? 'ltr' : undefined\}>/,
  );
  assert.match(
    notificationHistorySource,
    /notificationHistoryMeta b\[dir='ltr'\][^}]*unicode-bidi:isolate/,
  );
});


test('localized X share registry contains only labels used by the current product', () => {
  const shareSource = readFileSync(
    'src/lib/rewards/rewardReceiptShare.ts',
    'utf8',
  );
  const registry = shareSource.slice(
    shareSource.indexOf('export const REWARD_RECEIPT_SHARE_COPY'),
    shareSource.indexOf('export function formatRewardShareAmount'),
  );
  assert.doesNotMatch(registry, /\breceived:\s/);
  assert.doesNotMatch(registry, /\binvite:\s/);
  assert.match(registry, /label:/);
});
