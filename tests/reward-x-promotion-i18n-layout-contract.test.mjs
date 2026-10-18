import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SUPPORTED_LOCALES,
} from '../src/lib/i18n/locales.ts';
import {
  rewardReceiptShareLabel,
  rewardReceiptShareText,
  rewardReceiptXIntentUrl,
} from '../src/lib/rewards/rewardReceiptShare.ts';

const xCopySource = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const expandedCopySource = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopy.ts',
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

const promotionSources = xCopySource + '\n' + expandedCopySource;

const PROMOTION_KEYS = [
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
  const quoted = new RegExp(
    "(?:^|\\n)\\s*'" + locale + "'\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\},",
    'm',
  ).exec(source);
  if (quoted) return quoted[1];

  const bare = new RegExp(
    '(?:^|\\n)\\s*' + locale + '\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\},',
    'm',
  ).exec(source);
  return bare?.[1] ?? null;
}

function assertFields(block, locale, keys) {
  assert.ok(block, 'missing locale block: ' + locale);
  for (const key of keys) {
    assert.match(
      block,
      new RegExp('\\b' + key + '\\s*:'),
      locale + ' missing ' + key,
    );
  }
}

test('X promotion copy is complete and locally written for all supported locales', () => {
  assert.equal(SUPPORTED_LOCALES.length, 29);
  assert.doesNotMatch(promotionSources, /\.\.\.EN\b/);
  assert.match(xCopySource, /en:\s*EN/);
  assert.match(
    xCopySource,
    /\.\.\.REWARD_X_PROMOTION_EXPANDED_COPY/,
  );

  for (const key of PROMOTION_KEYS) {
    assert.match(
      xCopySource,
      new RegExp('\\b' + key + '\\s*:'),
      'English base copy missing ' + key,
    );
  }

  for (const locale of SUPPORTED_LOCALES) {
    if (locale === 'en') continue;
    assertFields(
      localeBlock(promotionSources, locale),
      locale,
      PROMOTION_KEYS,
    );
  }
});

test('localized X promotion controls stay bounded by the wrapped mobile layout contract', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const label = rewardReceiptShareLabel(locale);
    assert.ok(label.trim().length > 0, locale + ' X share label is empty');
    assert.ok([...label].length <= 24, locale + ' X share label is unexpectedly long');
  }

  assert.match(panelSource, /white-space:normal/);
  assert.match(panelSource, /overflow-wrap:anywhere/);
  assert.match(panelSource, /@media\(max-width:430px\)/);
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
    assert.match(text, /#B3TR/);
    assert.match(text, /#VeBetterDAO/);
    assert.doesNotMatch(text, /\bfriend(?:s)?\b/i);
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
  assert.doesNotMatch(submitErrorSource, /\.\.\.EN\b/);

  for (const locale of SUPPORTED_LOCALES) {
    assertFields(
      localeBlock(submitErrorSource, locale),
      locale,
      SUBMIT_ERROR_KEYS,
    );
  }

  assert.match(submitErrorSource, /status === 400[\s\S]*copy\.invalidPost/);
  assert.match(
    submitErrorSource,
    /status === 401 \|\| status === 403[\s\S]*copy\.walletAccess/,
  );
  assert.match(submitErrorSource, /status === 409[\s\S]*copy\.conflict/);
  assert.match(submitErrorSource, /status === 429[\s\S]*copy\.rateLimited/);
  assert.match(submitErrorSource, /return copy\.unavailable/);
});

test('X promotion client never renders raw API or network error messages', () => {
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panelSource, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(panelSource, /body\.error\s*\|\|/);
  assert.doesNotMatch(panelSource, /error instanceof Error[\s\S]*error\.message/);
  assert.doesNotMatch(panelSource, /The X Post could not be verified\./);
});
