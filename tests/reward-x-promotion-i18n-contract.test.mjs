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
const automationCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionAutomationCopy.ts',
  'utf8',
);
const errorCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionErrorCopy.ts',
  'utf8',
);
const panel = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);
const receipt = readFileSync(
  'src/components/RewardReceiptView.tsx',
  'utf8',
);
const share = readFileSync(
  'src/lib/rewards/rewardReceiptShare.ts',
  'utf8',
);

test('X promotion no longer inherits English UI copy for expanded locales', () => {
  assert.doesNotMatch(coreCopy, /\.\.\.EN\b/);
  assert.match(coreCopy, /\.\.\.REWARD_X_PROMOTION_EXPANDED_COPY/);

  for (const locale of [
    'hi', 'ar', 'bn', 'sv', 'ro', 'ur', 'pcm',
    'arz', 'mr', 'te', 'sw', 'ha', 'el', 'cs',
  ]) {
    assert.match(
      expandedCopy,
      new RegExp('(?:^|\\n)\\s*' + locale.replace('-', '\\-') + ':\\s*\\{', 'm'),
      'missing expanded X copy for ' + locale,
    );
  }

  for (const field of [
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
  ]) {
    assert.match(expandedCopy, new RegExp('\\b' + field + ':'));
  }
});

test('automatic X discovery copy is explicit for every supported locale', () => {
  for (const field of [
    'connectX',
    'connectedX',
    'autoConnectBody',
    'autoOpenBody',
    'autoGraceBody',
    'autoConnectedX',
  ]) {
    assert.match(automationCopy, new RegExp('\\b' + field + ':'));
  }

  assert.match(
    automationCopy,
    /Record<[\s\S]*SupportedLocale[\s\S]*RewardXPromotionAutomationCopy/,
  );
  assert.doesNotMatch(automationCopy, /\.\.\.EN\b/);

  assert.match(panel, /REWARD_X_PROMOTION_AUTOMATION_COPY\[locale\]/);
  assert.doesNotMatch(panel, /REWARD_X_PROMOTION_COPY\.en\.auto/);
  assert.doesNotMatch(panel, /copy\.connectX\s*\?\?/);
});

test('X promotion errors stay localized instead of exposing server messages', () => {
  assert.match(
    errorCopy,
    /Record<[\s\S]*SupportedLocale[\s\S]*RewardXPromotionErrorCopy/,
  );
  for (const field of [
    'stateUnavailable',
    'invalidPost',
    'walletAccess',
    'conflict',
    'rateLimited',
    'unavailable',
  ]) {
    assert.match(errorCopy, new RegExp('\\b' + field + ':'));
  }

  assert.match(panel, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panel, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(panel, /body\.error\s*\|\|/);
  assert.doesNotMatch(panel, /error instanceof Error[\s\S]*error\.message/);
  assert.doesNotMatch(panel, /The X Post could not be verified/);
  assert.doesNotMatch(panel, /X promotion state unavailable/);
});

test('X promotion layout isolates RTL technical values and wraps long localized controls', () => {
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
    assert.ok(panel.includes(expected), 'missing panel guard: ' + expected);
  }

  assert.match(
    panel,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
  assert.match(
    receipt,
    /\.notificationExplorerLink\{[\s\S]*white-space:normal[\s\S]*overflow-wrap:anywhere/,
  );
});

test('public X campaign post remains intentionally global and friend-neutral', () => {
  assert.match(
    share,
    /Public X campaign posts intentionally use one concise global English/,
  );
  assert.match(share, /locale: _locale/);
  assert.match(share, /I just earned \$\{amount\} #B3TR/);
  assert.match(share, /#VeBetterDAO/);
  const fn = share.slice(
    share.indexOf('export function rewardReceiptShareText'),
    share.indexOf('export function rewardReceiptShareLabel'),
  );
  assert.doesNotMatch(fn, /\bfriend(?:s)?\b/i);
});
