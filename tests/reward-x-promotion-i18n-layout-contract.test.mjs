import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const baseCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const expandedA = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopyA.ts',
  'utf8',
);
const expandedB = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopyB.ts',
  'utf8',
);
const autoCopy = readFileSync(
  'src/lib/i18n/rewardXPromotionAutoCopy.ts',
  'utf8',
);
const submitErrors = readFileSync(
  'src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts',
  'utf8',
);
const panel = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);
const qaPage = readFileSync(
  'src/app/qa/x-promotion-layout/page.tsx',
  'utf8',
);
const share = readFileSync(
  'src/lib/rewards/rewardReceiptShare.ts',
  'utf8',
);

const locales = [
  'en','ko','zh','zh-tw','ja','es','de','fr','it','tr','nl','pt','ru','id','vi',
  'hi','ar','bn','sv','ro','ur','pcm','arz','mr','te','sw','ha','el','cs',
];

test('X promotion copy has no English spread fallback and keeps all locale packs small', () => {
  for (const source of [baseCopy, expandedA, expandedB]) {
    assert.doesNotMatch(source, /\.\.\.EN\b/);
    assert.ok(source.length < 30_000);
  }

  assert.match(baseCopy, /REWARD_X_PROMOTION_EXPANDED_COPY/);
  assert.match(autoCopy, /Record<[\s\S]*SupportedLocale[\s\S]*RewardXPromotionAutoCopy/);

  for (const locale of locales) {
    const key = locale.includes('-')
      ? new RegExp("'" + locale + "'\\s*:")
      : new RegExp('\\b' + locale + '\\s*:');
    assert.match(
      autoCopy,
      key,
      'missing automatic X copy for ' + locale,
    );
    assert.match(
      submitErrors,
      key,
      'missing localized X submit error for ' + locale,
    );
  }
});

test('X promotion panel uses localized auto copy and never renders raw API errors', () => {
  assert.match(panel, /REWARD_X_PROMOTION_AUTO_COPY\[locale\]/);
  assert.match(panel, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panel, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(panel, /body\.error\s*\|\|/);
  assert.doesNotMatch(panel, /error instanceof Error[\s\S]*error\.message/);
  assert.doesNotMatch(panel, /REWARD_X_PROMOTION_COPY\.en\.auto/);
});

test('X promotion layout explicitly handles long copy and RTL technical values', () => {
  for (const guard of [
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
    assert.ok(panel.includes(guard), 'missing layout guard: ' + guard);
  }

  assert.match(
    panel,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});

test('dedicated QA page renders the real promotion panel without wallet providers', () => {
  assert.match(qaPage, /RewardXPromotionPanel/);
  assert.match(qaPage, /data-qa-x-promotion-layout/);
  assert.match(qaPage, /isLocale\(locale\)/);
  assert.doesNotMatch(qaPage, /wallet|VeWorld|WalletConnect/i);
});

test('public X campaign copy remains concise and friend-neutral', () => {
  const publicShare = share.slice(
    share.indexOf('export function rewardReceiptShareText'),
    share.indexOf('export function rewardReceiptShareLabel'),
  );
  assert.match(publicShare, /@Veinvite/);
  assert.match(publicShare, /#B3TR/);
  assert.match(publicShare, /#VeBetterDAO/);
  assert.doesNotMatch(publicShare, /\bfriend(?:s)?\b/i);
});
