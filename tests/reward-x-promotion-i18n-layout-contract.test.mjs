import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const locales = read('src/lib/i18n/locales.ts');
const baseCopy = read('src/lib/i18n/rewardXPromotionCopy.ts');
const expandedCopy = read('src/lib/i18n/rewardXPromotionExpandedCoreCopy.ts');
const autoCopy = read('src/lib/i18n/rewardXPromotionAutoCopy.ts');
const expandedAutoCopy = read('src/lib/i18n/rewardXPromotionExpandedAutoCopy.ts');
const errorCopy = read('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts');
const panel = read('src/components/RewardXPromotionPanel.tsx');
const popup = read('src/hooks/useRewardPaidTransientFeedback.ts');

const registered = Array.from(
  locales.matchAll(/\{ locale: '([^']+)'/g),
  (match) => match[1],
);

function localePattern(locale) {
  return new RegExp(
    '(?:^|\\n)\\s*[\\x27\\x22]?' +
      locale +
      '[\\x27\\x22]?\\s*:',
    'm',
  );
}

test('X promotion localized copy covers every supported locale without English object spreading', () => {
  assert.equal(registered.length, 29);

  const core = baseCopy + '\n' + expandedCopy;
  const automatic = autoCopy + '\n' + expandedAutoCopy;
  for (const locale of registered) {
    assert.match(core, localePattern(locale), 'missing core locale: ' + locale);
    assert.match(automatic, localePattern(locale), 'missing auto locale: ' + locale);
    assert.match(errorCopy, localePattern(locale), 'missing error locale: ' + locale);
  }

  assert.doesNotMatch(core, /\.\.\.EN\b/);
  assert.doesNotMatch(automatic, /\.\.\.EN\b/);
  assert.match(baseCopy, /Record<SupportedLocale, RewardXPromotionBaseCopy>/);
  assert.match(autoCopy, /Record<[\s\S]*SupportedLocale,[\s\S]*RewardXPromotionAutoCopy/);
  assert.match(errorCopy, /Record<[\s\S]*SupportedLocale,[\s\S]*RewardXPromotionSubmitErrorCopy/);
});

test('automatic X flow is a required localized part of the final promotion copy', () => {
  for (const field of [
    'connectX',
    'connectedX',
    'autoConnectBody',
    'autoOpenBody',
    'autoGraceBody',
    'autoConnectedX',
    'autoShareFollowupBody',
  ]) {
    assert.match(autoCopy, new RegExp('\\b' + field + ':'));
  }

  assert.match(baseCopy, /RewardXPromotionBaseCopy\s*&\s*RewardXPromotionAutoCopy/);
  assert.doesNotMatch(panel, /REWARD_X_PROMOTION_COPY\.en\.(?:auto|connect)/);
  assert.match(panel, /copy\.autoOpenBody/);
  assert.match(panel, /copy\.autoConnectBody/);
  assert.match(panel, /copy\.autoGraceBody/);
  assert.match(panel, /copy\.autoConnectedX/);
  assert.match(panel, /copy\.connectX/);
});

test('manual and URL-less share follow-up instructions cannot cross', () => {
  assert.match(popup, /xUrlLessEnabled\?: boolean/);
  assert.match(popup, /xConnected\?: boolean/);
  assert.match(popup, /const usesAuto = body\.xUrlLessEnabled === true/);
  assert.match(
    popup,
    /const canSharePromotion =\s*!usesAuto \|\| body\.xConnected === true/,
  );
  assert.match(
    popup,
    /autoShareFollowup[\s\S]*REWARD_X_PROMOTION_COPY\[locale\]\.autoShareFollowupBody[\s\S]*REWARD_X_PROMOTION_COPY\[locale\]\.shareFollowupBody/,
  );
});

test('X promotion client never renders raw API or exception messages', () => {
  assert.match(panel, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panel, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(panel, /body\.error\s*\|\|/);
  assert.doesNotMatch(panel, /error instanceof Error[\s\S]*error\.message/);
  assert.doesNotMatch(panel, /The X Post could not be verified\./);
  assert.doesNotMatch(panel, /X promotion state unavailable\./);
});

test('X promotion layout explicitly protects long and RTL translations', () => {
  for (const guard of [
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
    assert.ok(panel.includes(guard), 'missing layout guard: ' + guard);
  }

  assert.match(
    panel,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
  assert.match(
    panel,
    /className="promotionConnect"[\s\S]*\{copy\.connectX\}/,
  );
  assert.match(
    panel,
    /className="promotionSubmit"[\s\S]*<input[\s\S]*dir="ltr"/,
  );
});
