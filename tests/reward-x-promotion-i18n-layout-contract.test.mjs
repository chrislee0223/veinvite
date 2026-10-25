import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const localesSource = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const copySource = readFileSync('src/lib/i18n/rewardXPromotionCopy.ts', 'utf8');
const expandedSource = readFileSync('src/lib/i18n/rewardXPromotionExpandedCopy.ts', 'utf8');
const autoSource = [
  readFileSync('src/lib/i18n/rewardXPromotionAutoCopyCore.ts', 'utf8'),
  readFileSync('src/lib/i18n/rewardXPromotionAutoCopyExpanded.ts', 'utf8'),
].join('\n');
const errorSource = readFileSync('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts', 'utf8');
const panelSource = readFileSync('src/components/RewardXPromotionPanel.tsx', 'utf8');
const shareSource = readFileSync('src/lib/rewards/rewardReceiptShare.ts', 'utf8');

const supportedLocales = Array.from(
  localesSource.matchAll(/\{ locale: '([^']+)'/g),
  (match) => match[1],
);

const expandedLocales = [
  'hi', 'ar', 'bn', 'sv', 'ro', 'ur', 'pcm',
  'arz', 'mr', 'te', 'sw', 'ha', 'el', 'cs',
];

const autoFields = [
  'connectX',
  'connectedX',
  'autoConnectBody',
  'autoOpenBody',
  'autoShareFollowupBody',
  'autoGraceBody',
  'autoConnectedX',
];

const baseFields = [
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
  const key = locale.includes('-') ? "'"+locale+"'" : locale;
  const match = source.match(
    new RegExp('(?:^|\\n)\\s*' + key.replace('-', '\\-') + ':\\s*\\{([\\s\\S]*?)\\n\\s*\\},', 'm'),
  );
  return match?.[1] ?? '';
}

test('X promotion localization covers all 29 supported locales without English spread fallback', () => {
  assert.equal(supportedLocales.length, 29);
  assert.doesNotMatch(copySource, /\.\.\.EN\b/);

  for (const locale of expandedLocales) {
    const block = localeBlock(expandedSource, locale);
    assert.ok(block, 'missing expanded locale: ' + locale);
    for (const field of baseFields) {
      assert.match(block, new RegExp('\\b' + field + ':'));
    }
  }
});

test('automatic X verification copy is fully localized for every supported locale', () => {
  for (const locale of supportedLocales) {
    const block = localeBlock(autoSource, locale);
    assert.ok(block, 'missing automatic X copy: ' + locale);
    for (const field of autoFields) {
      assert.match(
        block,
        new RegExp('\\b' + field + ':'),
        locale + ' missing ' + field,
      );
    }
  }

  for (const field of autoFields) {
    assert.match(copySource, new RegExp(field + ': string;'));
    assert.doesNotMatch(copySource, new RegExp(field + '\\?: string;'));
  }
});

test('X promotion submit errors are localized and raw API errors are not rendered', () => {
  for (const locale of supportedLocales) {
    const block = localeBlock(errorSource, locale);
    assert.ok(block, 'missing X submit error copy: ' + locale);
    for (const field of [
      'invalidPost',
      'walletAccess',
      'conflict',
      'rateLimited',
      'unavailable',
    ]) {
      assert.match(block, new RegExp('\\b' + field + ':'));
    }
  }

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
    /error instanceof Error[\s\S]{0,120}error\.message/,
  );
  assert.doesNotMatch(
    panelSource,
    /The X Post could not be verified\./,
  );
});

test('X promotion panel protects long and RTL copy without shrinking typography', () => {
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
      panelSource.includes(expected),
      'missing X promotion layout guard: ' + expected,
    );
  }

  assert.match(
    panelSource,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
  assert.match(
    panelSource,
    /className="promotionConnect"[\s\S]*\{copy\.connectX\}/,
  );
  assert.doesNotMatch(
    panelSource,
    /copy\.(?:autoOpenBody|autoConnectBody|autoGraceBody|autoConnectedX|connectedX|connectX)\s*\?\?/,
  );
});

test('public X campaign post intentionally stays global while in-app controls remain localized', () => {
  assert.match(
    shareSource,
    /export function rewardReceiptShareText\(\{[\s\S]*locale: _locale/,
  );
  assert.match(shareSource, /I just earned \$\{amount\} #B3TR/);
  assert.match(shareSource, /with @Veinvite on #VeBetterDAO/);
  assert.match(
    shareSource,
    /return REWARD_RECEIPT_SHARE_COPY\[locale\]\.label/,
  );
});
