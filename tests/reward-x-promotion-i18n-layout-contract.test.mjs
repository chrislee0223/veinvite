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
import {
  REWARD_X_PROMOTION_SUBMIT_ERROR_COPY,
  rewardXPromotionSubmitError,
} from '../src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts';

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
const qaHarnessSource = readFileSync(
  'src/qa/QaRewardXPromotionHarness.tsx',
  'utf8',
);
const appProvidersSource = readFileSync(
  'src/components/AppProviders.tsx',
  'utf8',
);
const hydrationShieldSource = readFileSync(
  'src/components/LocaleHydrationShield.tsx',
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
  'shareFollowupBody',
  'postUrlPlaceholder',
  'verify',
  'verifying',
  'retry',
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

test('X promotion copy is complete for all 29 supported locales', () => {
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

test('localized X promotion controls remain compatible with wrapped mobile layout', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const label = rewardReceiptShareLabel(locale);
    assert.ok(label.trim().length > 0, locale + ' X share label is empty');
    assert.ok(
      [...label].length <= 24,
      locale + ' X share label is unexpectedly long',
    );
  }

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
});

test('X promotion submit errors are localized and status-mapped for every locale', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY[locale];
    assert.ok(copy, 'missing submit error copy: ' + locale);

    for (const key of [
      'invalidPost',
      'walletAccess',
      'conflict',
      'rateLimited',
      'unavailable',
    ]) {
      assert.equal(typeof copy[key], 'string');
      assert.ok(copy[key].trim().length > 0, locale + ' ' + key + ' empty');
    }

    if (locale !== 'en') {
      assert.notEqual(
        copy.unavailable,
        REWARD_X_PROMOTION_SUBMIT_ERROR_COPY.en.unavailable,
      );
    }

    assert.equal(rewardXPromotionSubmitError(locale, 400), copy.invalidPost);
    assert.equal(rewardXPromotionSubmitError(locale, 401), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 403), copy.walletAccess);
    assert.equal(rewardXPromotionSubmitError(locale, 409), copy.conflict);
    assert.equal(rewardXPromotionSubmitError(locale, 429), copy.rateLimited);
    assert.equal(rewardXPromotionSubmitError(locale, 500), copy.unavailable);
    assert.equal(rewardXPromotionSubmitError(locale, 0), copy.unavailable);
  }
});

test('X promotion client never renders raw submit API errors', () => {
  assert.match(
    panelSource,
    /rewardXPromotionSubmitError\(locale, response\.status\)/,
  );
  assert.match(
    panelSource,
    /rewardXPromotionSubmitError\(locale, 0\)/,
  );
  assert.doesNotMatch(panelSource, /body\.error\s*\|\|/);
  assert.doesNotMatch(
    panelSource,
    /error instanceof Error[\s\S]*error\.message/,
  );
  assert.doesNotMatch(
    panelSource,
    /The X Post could not be verified\./,
  );
});

test('public X campaign post remains one reviewed global template', () => {
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
    );

    const intent = new URL(rewardReceiptXIntentUrl({
      locale,
      amountB3tr: '193.91',
      referralUrl: 'https://veinvite.vercel.app/s/AbCdEfGhIjKlMnOp',
    }));
    const text = intent.searchParams.get('text') ?? '';
    assert.ok(text.length < 280, locale + ' X intent exceeds 280 chars');
    assert.match(text, /@Veinvite/);
    assert.match(text, /#B3TR/);
    assert.match(text, /#VeBetterDAO/);
    assert.doesNotMatch(text, /\bfriend(?:s)?\b/i);
  }
});

test('dedicated X promotion QA harness is hydration-safe', () => {
  assert.match(
    qaHarnessSource,
    /data-qa-x-promotion-ready="true"/,
  );
  assert.match(
    qaHarnessSource,
    /data-qa-x-promotion-hydrated=\{hydrated \? 'true' : 'false'\}/,
  );
  assert.match(
    qaHarnessSource,
    /const \[hydrated, setHydrated\] = useState\(false\)/,
  );
  assert.match(
    qaHarnessSource,
    /useEffect\(\(\) => \{[\s\S]*setHydrated\(true\);[\s\S]*\}, \[\]\);/,
  );
  assert.match(
    qaHarnessSource,
    /data-qa-x-promotion-active-locale=\{activeLocale\}/,
  );
  assert.doesNotMatch(
    qaHarnessSource,
    /if \(!hydrated\)/,
  );
  assert.doesNotMatch(
    qaHarnessSource,
    /data-qa-x-promotion-ready="false"/,
  );
  assert.match(
    qaHarnessSource,
    /<RewardReceiptView[\s\S]*receipt=\{QA_X_PROMOTION_RECEIPT\}/,
  );
});


test('X promotion QA route stays provider-light and hydration-safe', () => {
  assert.match(
    appProvidersSource,
    /X_PROMOTION_LAYOUT_QA_PATH = '\/qa\/x-promotion'/,
  );
  assert.match(
    hydrationShieldSource,
    /X_PROMOTION_LAYOUT_QA_PATH = '\/qa\/x-promotion'/,
  );
  assert.match(
    appProvidersSource,
    /pathname === X_PROMOTION_LAYOUT_QA_PATH/,
  );
  assert.match(
    hydrationShieldSource,
    /pathname === X_PROMOTION_LAYOUT_QA_PATH/,
  );
});
