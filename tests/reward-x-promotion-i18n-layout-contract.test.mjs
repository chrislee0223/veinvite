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
const copySource = readFileSync(
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'utf8',
);
const expandedSource = readFileSync(
  'src/lib/i18n/rewardXPromotionExpandedCopy.ts',
  'utf8',
);
const autoSource = readFileSync(
  'src/lib/i18n/rewardXPromotionAutoCopy.ts',
  'utf8',
);
const submitErrorSource = readFileSync(
  'src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts',
  'utf8',
);
const panelSource = readFileSync(
  'src/components/RewardXPromotionPanel.tsx',
  'utf8',
);

const registered = Array.from(
  localesSource.matchAll(/\{ locale: '([^']+)'/g),
  (m) => m[1],
);

function localePattern(locale) {
  return new RegExp(
    '(?:^|\\n)\\s*[\\x27\\x22]?' +
      locale.replace('-', '\\-') +
      '[\\x27\\x22]?\\s*:',
  );
}

test('X promotion body copy covers all registered locales without EN object fallback', () => {
  assert.equal(registered.length, 29);
  assert.doesNotMatch(copySource, /\.\.\.EN\b/);
  const combined = copySource + '\n' + expandedSource;

  for (const locale of registered) {
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
  assert.match(copySource, /REWARD_X_PROMOTION_EXPANDED_COPY/);
});

test('automatic X connection/search copy covers all 29 locales', () => {
  for (const locale of registered) {
    assert.match(
      autoSource,
      localePattern(locale),
      'missing auto-X locale: ' + locale,
    );
  }

  for (const key of [
    'connectX',
    'connectedX',
    'autoConnectBody',
    'autoOpenBody',
    'autoGraceBody',
    'autoConnectedX',
  ]) {
    assert.ok(
      (autoSource.match(new RegExp('\\b' + key + ':', 'g')) ?? []).length >= 30,
      'incomplete auto-X key: ' + key,
    );
  }

  assert.match(panelSource, /REWARD_X_PROMOTION_AUTO_COPY\[locale\]/);
  assert.doesNotMatch(
    panelSource,
    /copy\.auto(?:ConnectBody|OpenBody|GraceBody|ConnectedX)\s*\?\?/,
  );
});

test('X promotion submission errors are localized and raw submit errors are not rendered', () => {
  for (const locale of registered) {
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
    assert.ok(
      (submitErrorSource.match(new RegExp('\\b' + key + ':', 'g')) ?? []).length >= 30,
      'incomplete submit-error key: ' + key,
    );
  }

  assert.match(submitErrorSource, /status === 400/);
  assert.match(submitErrorSource, /status === 401 \|\| status === 403/);
  assert.match(submitErrorSource, /status === 409/);
  assert.match(submitErrorSource, /status === 429/);

  const submitStart = panelSource.indexOf('const submitPost');
  const submitEnd = panelSource.indexOf('if (loading)', submitStart);
  const submitBlock = panelSource.slice(submitStart, submitEnd);
  assert.match(submitBlock, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(submitBlock, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(submitBlock, /body\.error/);
  assert.doesNotMatch(submitBlock, /error\.message/);
});

test('X promotion panel keeps long-copy and bidi layout guards', () => {
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
      'missing layout guard: ' + expected,
    );
  }

  assert.match(
    panelSource,
    /className="promotionShare"[\s\S]*<span>\{rewardReceiptShareLabel\(locale\)\}<\/span>[\s\S]*<b dir="ltr">/,
  );
});

test('public X campaign post stays global while in-app share labels remain localized', () => {
  const baseline = rewardReceiptShareText({
    locale: 'en',
    amountB3tr: '193.91',
  });

  for (const locale of registered) {
    assert.ok(rewardReceiptShareLabel(locale).trim().length > 0);

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
    assert.ok(
      text.length < 280,
      locale + ' X intent exceeds 280 characters',
    );
    assert.match(text, /@Veinvite/);
    assert.match(text, /#B3TR/);
    assert.match(text, /#VeBetterDAO/);
    assert.doesNotMatch(text, /\bfriend(?:s)?\b/i);
  }
});
