import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const locales = read('src/lib/i18n/locales.ts');
const promotionCopy = read('src/lib/i18n/rewardXPromotionCopy.ts');
const expandedCopy = read('src/lib/i18n/rewardXPromotionExpandedCopy.ts');
const oauthCopy = read('src/lib/i18n/rewardXPromotionOAuthCopy.ts');
const submitErrorCopy = read('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts');
const panel = read('src/components/RewardXPromotionPanel.tsx');
const oauthFeedback = read('src/hooks/useXPromotionOAuthReturnFeedback.ts');
const share = read('src/lib/rewards/rewardReceiptShare.ts');

const supportedLocales = [...locales.matchAll(/\{ locale: '([^']+)'/g)].map(
  (match) => match[1],
);

function localeRegistry(source) {
  const locales = [...source.matchAll(
    /(?:^|\n)\s*(?:'([^']+)'|([a-z]+)):\s*\{/g,
  )].map((match) => match[1] ?? match[2]);

  if (/\ben:\s*EN\b/.test(source)) locales.push('en');

  return locales;
}

test('X promotion state copy covers all 29 locales without English spread fallbacks', () => {
  assert.equal(supportedLocales.length, 29);
  assert.equal(new Set(supportedLocales).size, supportedLocales.length);

  const combined = promotionCopy + '\n' + expandedCopy;
  const translated = new Set(localeRegistry(combined));

  for (const locale of supportedLocales) {
    assert.ok(translated.has(locale), 'missing promotion copy: ' + locale);
  }

  assert.doesNotMatch(combined, /\.\.\.EN\b/);
  assert.doesNotMatch(promotionCopy, /connectX\??:/);
  assert.doesNotMatch(promotionCopy, /connectedX\??:/);
});

test('OAuth and submit-error copy explicitly cover every supported locale', () => {
  const oauthLocales = new Set(localeRegistry(oauthCopy));
  const submitLocales = new Set(localeRegistry(submitErrorCopy));

  for (const locale of supportedLocales) {
    assert.ok(oauthLocales.has(locale), 'missing OAuth copy: ' + locale);
    assert.ok(submitLocales.has(locale), 'missing submit error copy: ' + locale);
  }

  for (const key of [
    'connectX',
    'connectedX',
    'conflictBody',
    'privateBody',
    'failedBody',
  ]) {
    assert.match(oauthCopy, new RegExp('\\b' + key + ':'));
  }

  for (const key of [
    'invalidPost',
    'walletAccess',
    'conflict',
    'rateLimited',
    'unavailable',
  ]) {
    assert.match(submitErrorCopy, new RegExp('\\b' + key + ':'));
  }
});

test('X promotion panel keeps long and RTL copy inside the receipt', () => {
  for (const expected of [
    'getLocaleDirection',
    'REWARD_X_PROMOTION_OAUTH_COPY',
    'rewardXPromotionSubmitError',
    'lang={locale}',
    'dir={direction}',
    'dir="ltr"',
    'overflow-wrap:anywhere',
    'white-space:normal',
    'unicode-bidi:isolate',
    '@media(max-width:430px)',
    'grid-template-columns:1fr',
  ]) {
    assert.ok(panel.includes(expected), 'missing layout/i18n guard: ' + expected);
  }

  assert.match(
    panel,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
  assert.doesNotMatch(panel, /copy\.connectX/);
  assert.doesNotMatch(panel, /copy\.connectedX/);
});

test('X submit errors never render raw API or exception messages', () => {
  assert.match(panel, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panel, /rewardXPromotionSubmitError\(locale, 0\)/);

  const submitStart = panel.indexOf('const submitPost');
  const submitEnd = panel.indexOf('if (loading)', submitStart);
  const submitBlock = panel.slice(submitStart, submitEnd);

  assert.doesNotMatch(submitBlock, /body\.error/);
  assert.doesNotMatch(submitBlock, /error\.message/);
  assert.doesNotMatch(submitBlock, /The X Post could not be verified/);
});

test('OAuth return feedback follows the selected locale instead of Korean/English branching', () => {
  assert.match(oauthFeedback, /REWARD_X_PROMOTION_OAUTH_COPY\[displayLocale\]/);
  assert.match(oauthFeedback, /copy\.conflictBody/);
  assert.match(oauthFeedback, /copy\.privateBody/);
  assert.match(oauthFeedback, /copy\.failedBody/);
  assert.doesNotMatch(oauthFeedback, /const korean =/);
  assert.doesNotMatch(oauthFeedback, /displayLocale === 'ko'/);
});

test('public X campaign post stays global while in-app share controls stay localized', () => {
  assert.match(
    share,
    /Public X campaign posts intentionally use one concise global English/,
  );
  assert.match(share, /rewardReceiptShareLabel/);
  assert.doesNotMatch(share, /\breceived:/);
  assert.doesNotMatch(share, /\binvite:/);

  const shareFunction = share.slice(
    share.indexOf('export function rewardReceiptShareText'),
    share.indexOf('export function rewardReceiptShareLabel'),
  );
  assert.doesNotMatch(shareFunction, /\bfriend(?:s)?\b/i);
  assert.match(shareFunction, /@Veinvite/);
  assert.match(shareFunction, /#VeBetterDAO/);
});
