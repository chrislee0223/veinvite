import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const localesSource = read('src/lib/i18n/locales.ts');
const promotionSource = read('src/lib/i18n/rewardXPromotionCopy.ts');
const expandedSource = read('src/lib/i18n/rewardXPromotionExpandedCopy.ts');
const autoSource = [
  read('src/lib/i18n/rewardXPromotionAutoCore.ts'),
  read('src/lib/i18n/rewardXPromotionAutoExpanded.ts'),
].join('\n');
const autoRegistrySource = read('src/lib/i18n/rewardXPromotionAutoCopy.ts');
const submitErrorSource = read('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts');
const panelSource = read('src/components/RewardXPromotionPanel.tsx');
const shareSource = read('src/lib/rewards/rewardReceiptShare.ts');

const locales = Array.from(
  localesSource.matchAll(/\{ locale: '([^']+)'/g),
  (match) => match[1],
);

function localePattern(locale) {
  const escaped = locale.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
  return new RegExp(
    '(?:^|\\n)\\s*[\\x27\\x22]?' +
      escaped +
      '[\\x27\\x22]?\\s*:',
    'u',
  );
}

test('X promotion copy covers all 29 locales without English spread fallback', () => {
  assert.equal(locales.length, 29);
  assert.doesNotMatch(promotionSource, /\.\.\.EN\b/u);
  assert.doesNotMatch(expandedSource, /\.\.\.EN\b/u);

  const combined = promotionSource + '\n' + expandedSource;
  for (const locale of locales) {
    assert.match(
      combined,
      localePattern(locale),
      'missing X promotion locale: ' + locale,
    );
  }

  assert.equal(
    (combined.match(/shareFollowupBody:/g) ?? []).length,
    30,
  );
  assert.match(promotionSource, /\.\.\.REWARD_X_PROMOTION_EXPANDED_COPY/u);
});

test('automatic X account flow has an explicit entry for every locale', () => {
  for (const locale of locales) {
    assert.match(
      autoSource,
      localePattern(locale),
      'missing automatic X locale: ' + locale,
    );
  }

  for (const key of [
    'connectX',
    'connectedX',
    'autoConnectBody',
    'autoOpenBody',
    'autoShareFollowupBody',
    'autoGraceBody',
    'autoConnectedX',
  ]) {
    assert.equal(
      (autoSource.match(new RegExp('\\b' + key + ':', 'g')) ?? []).length,
      29,
      'automatic X field coverage mismatch: ' + key,
    );
  }

  assert.match(autoRegistrySource, /REWARD_X_PROMOTION_AUTO_CORE/u);
  assert.match(autoRegistrySource, /REWARD_X_PROMOTION_AUTO_EXPANDED/u);
  assert.doesNotMatch(
    panelSource,
    /REWARD_X_PROMOTION_COPY\.en\.(?:auto|connect)/u,
  );
});

test('X promotion submission error UI is localized and never renders raw API errors', () => {
  for (const locale of locales) {
    assert.match(
      submitErrorSource,
      localePattern(locale),
      'missing submit-error locale: ' + locale,
    );
  }

  for (const key of [
    'invalidPost',
    'walletAccess',
    'conflict',
    'rateLimited',
    'unavailable',
  ]) {
    assert.equal(
      (submitErrorSource.match(new RegExp('\\b' + key + ':', 'g')) ?? []).length,
      30,
      'submit-error field coverage mismatch: ' + key,
    );
  }

  assert.match(
    submitErrorSource,
    /status === 400[\s\S]*copy\.invalidPost/u,
  );
  assert.match(
    submitErrorSource,
    /status === 401 \|\| status === 403[\s\S]*copy\.walletAccess/u,
  );
  assert.match(
    submitErrorSource,
    /status === 409[\s\S]*copy\.conflict/u,
  );
  assert.match(
    submitErrorSource,
    /status === 429[\s\S]*copy\.rateLimited/u,
  );

  const submitStart = panelSource.indexOf('const submitPost');
  const submitEnd = panelSource.indexOf('if (loading)', submitStart);
  const submitBlock = panelSource.slice(submitStart, submitEnd);

  assert.match(
    submitBlock,
    /rewardXPromotionSubmitError\(locale, response\.status\)/u,
  );
  assert.match(
    submitBlock,
    /rewardXPromotionSubmitError\(locale, 0\)/u,
  );
  assert.doesNotMatch(submitBlock, /body\.error\s*\|\|/u);
  assert.doesNotMatch(
    submitBlock,
    /error instanceof Error[\s\S]*error\.message/u,
  );
});

test('X promotion panel has long-copy, mobile and bidi layout guards', () => {
  for (const expected of [
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
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/u,
  );
});

test('public X campaign post remains a single reviewed global template', () => {
  assert.match(
    shareSource,
    /export function rewardReceiptShareText\(\{[\s\S]*locale: _locale/u,
  );
  assert.match(shareSource, /I just earned \$\{amount\} #B3TR/u);
  assert.match(shareSource, /@Veinvite/u);
  assert.match(shareSource, /#VeBetterDAO/u);
  assert.doesNotMatch(
    shareSource.slice(
      shareSource.indexOf('export function rewardReceiptShareText'),
      shareSource.indexOf('export function rewardReceiptShareLabel'),
    ),
    /\bfriend(?:s)?\b/iu,
  );
});
