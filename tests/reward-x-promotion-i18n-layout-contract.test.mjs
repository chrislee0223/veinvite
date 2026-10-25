import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const localesSource = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const manualMain = readFileSync('src/lib/i18n/rewardXPromotionCopy.ts', 'utf8');
const manualA = readFileSync('src/lib/i18n/rewardXPromotionExpandedCopyA.ts', 'utf8');
const manualB = readFileSync('src/lib/i18n/rewardXPromotionExpandedCopyB.ts', 'utf8');
const autoMain = readFileSync('src/lib/i18n/rewardXPromotionAutoCopy.ts', 'utf8');
const autoA = readFileSync('src/lib/i18n/rewardXPromotionAutoCopyA.ts', 'utf8');
const autoB = readFileSync('src/lib/i18n/rewardXPromotionAutoCopyB.ts', 'utf8');
const submitErrors = readFileSync('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts', 'utf8');
const panel = readFileSync('src/components/RewardXPromotionPanel.tsx', 'utf8');
const share = readFileSync('src/lib/rewards/rewardReceiptShare.ts', 'utf8');

const locales = Array.from(
  localesSource.matchAll(/\{ locale: '([^']+)'/g),
  (match) => match[1],
);

function localeToken(locale) {
  return locale.includes('-') ? "'" + locale + "'" : locale;
}

function hasLocale(source, locale) {
  const token = localeToken(locale).replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
  return new RegExp('(?:^|\\n)\\s*' + token + '\\s*:', 'm').test(source);
}

test('X promotion manual copy covers all 29 locales without English object spreading', () => {
  assert.equal(locales.length, 29);
  const combined = manualMain + '\n' + manualA + '\n' + manualB;

  assert.doesNotMatch(combined, /\.\.\.EN\b/);
  assert.match(manualMain, /en:\s*EN/);

  for (const locale of locales.filter((value) => value !== 'en')) {
    assert.equal(
      hasLocale(combined, locale),
      true,
      'missing manual X promotion locale: ' + locale,
    );
  }

  for (const field of [
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
    'verify',
    'verifying',
    'retry',
  ]) {
    assert.match(combined, new RegExp('\\b' + field + '\\s*:'));
  }
});

test('automatic X account flow has a dedicated translation for every locale', () => {
  const combined = autoMain + '\n' + autoA + '\n' + autoB;
  assert.match(autoMain, /Record<[\s\S]*SupportedLocale[\s\S]*RewardXPromotionAutoCopy/);

  for (const locale of locales) {
    assert.equal(
      hasLocale(combined, locale),
      true,
      'missing automatic X flow locale: ' + locale,
    );
  }

  for (const field of [
    'connectX',
    'connectedX',
    'autoConnectBody',
    'autoOpenBody',
    'autoShareFollowupBody',
    'autoGraceBody',
    'autoConnectedX',
  ]) {
    assert.match(combined, new RegExp('\\b' + field + '\\s*:'));
  }

  assert.doesNotMatch(panel, /REWARD_X_PROMOTION_COPY\.en\.auto/);
  assert.match(panel, /REWARD_X_PROMOTION_AUTO_COPY\[locale\]/);
});

test('X promotion submit errors are localized instead of rendering raw API messages', () => {
  for (const locale of locales) {
    assert.equal(
      hasLocale(submitErrors, locale),
      true,
      'missing submit-error locale: ' + locale,
    );
  }

  for (const field of [
    'invalidPost',
    'walletAccess',
    'conflict',
    'rateLimited',
    'unavailable',
  ]) {
    assert.match(submitErrors, new RegExp('\\b' + field + '\\s*:'));
  }

  const submitStart = panel.indexOf('const submitPost = useCallback');
  const submitEnd = panel.indexOf('  if (loading)', submitStart);
  assert.ok(submitStart >= 0 && submitEnd > submitStart);
  const submitBlock = panel.slice(submitStart, submitEnd);

  assert.match(submitBlock, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(submitBlock, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(submitBlock, /body\.error/);
  assert.doesNotMatch(submitBlock, /error\.message/);
  assert.doesNotMatch(submitBlock, /The X Post could not be verified/);
});

test('X promotion panel contains long-copy and bidi layout guards', () => {
  for (const expected of [
    'getLocaleDirection(locale)',
    'lang={locale}',
    'dir={direction}',
    'dir="ltr"',
    'overflow-wrap:anywhere',
    'white-space:normal',
    'unicode-bidi:isolate',
    '@media(max-width:430px)',
    'grid-template-columns:1fr',
  ]) {
    assert.equal(
      panel.includes(expected),
      true,
      'missing panel layout guard: ' + expected,
    );
  }

  assert.match(
    panel,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});

test('public X campaign text stays deliberately global while UI controls remain localized', () => {
  assert.match(share, /intentionally use one concise global English/);
  assert.match(share, /REWARD_RECEIPT_SHARE_COPY: Record<[\s\S]*SupportedLocale/);
  assert.match(share, /I just earned \$\{amount\} #B3TR/);
  assert.match(share, /@Veinvite on #VeBetterDAO/);
  assert.doesNotMatch(
    share.slice(
      share.indexOf('export function rewardReceiptShareText'),
      share.indexOf('export function rewardReceiptShareLabel'),
    ),
    /\bfriend(?:s)?\b/i,
  );
});
