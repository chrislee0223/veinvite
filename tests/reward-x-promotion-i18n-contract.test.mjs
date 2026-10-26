import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const localesSource = readFileSync('src/lib/i18n/locales.ts', 'utf8');
const mainCopy = readFileSync('src/lib/i18n/rewardXPromotionCopy.ts', 'utf8');
const packA = readFileSync('src/lib/i18n/rewardXPromotionExpandedCopyA.ts', 'utf8');
const packB = readFileSync('src/lib/i18n/rewardXPromotionExpandedCopyB.ts', 'utf8');
const autoCopy = readFileSync('src/lib/i18n/rewardXPromotionAutoCopy.ts', 'utf8');
const submitErrors = readFileSync('src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts', 'utf8');
const panel = readFileSync('src/components/RewardXPromotionPanel.tsx', 'utf8');

const supportedLocales = [...localesSource.matchAll(/\{ locale: '([^']+)'/g)]
  .map((match) => match[1]);

const baseCopy = mainCopy + '\n' + packA + '\n' + packB;

function objectBlock(source, locale) {
  const escaped = locale.replaceAll('-', '\\-');
  const quoted = locale.includes('-')
    ? "'" + escaped + "'"
    : "(?:'" + escaped + "'|" + escaped + ")";
  return source.match(
    new RegExp(
      "(?:^|\\n)\\s*" + quoted + "\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\},",
      'm',
    ),
  )?.[1] ?? '';
}

test('X promotion copy explicitly covers all 29 locales without EN spread fallback', () => {
  assert.equal(supportedLocales.length, 29);
  assert.doesNotMatch(baseCopy + autoCopy, /\.\.\.EN\b/);

  const requiredBase = [
    'title','openBody','graceBody','verifyingBody','retentionBody',
    'reviewBody','payoutBody','paidBody','expiredBody','releasedBody',
    'preparingBody','shareFollowupBody','postUrlPlaceholder','verify',
    'verifying','retry',
  ];
  const requiredAuto = [
    'connectX','connectedX','autoConnectBody','autoOpenBody',
    'autoShareFollowupBody','autoGraceBody','autoConnectedX',
  ];

  assert.match(mainCopy, /\ben:\s*EN\b/);
  for (const key of [...requiredBase, ...requiredAuto]) {
    assert.match(mainCopy, new RegExp('\\b' + key + ':'));
  }

  for (const locale of supportedLocales.filter((value) => value !== 'en')) {
    const block = objectBlock(baseCopy, locale);
    assert.ok(block, 'missing X promotion copy block for ' + locale);
    for (const key of requiredBase) {
      assert.match(block, new RegExp('\\b' + key + ':'), locale + ' missing ' + key);
    }

    const directAutoComplete = requiredAuto.every(
      (key) => new RegExp('\\b' + key + ':').test(block),
    );
    if (directAutoComplete) continue;

    const spreadNeedle = locale.includes('-')
      ? "...REWARD_X_PROMOTION_AUTO_COPY['" + locale + "']"
      : '...REWARD_X_PROMOTION_AUTO_COPY.' + locale;
    assert.ok(block.includes(spreadNeedle), locale + ' missing localized auto-copy spread');

    const autoBlock = objectBlock(autoCopy, locale);
    assert.ok(autoBlock, 'missing auto-copy block for ' + locale);
    for (const key of requiredAuto) {
      assert.match(autoBlock, new RegExp('\\b' + key + ':'), locale + ' auto-copy missing ' + key);
    }
  }
});

test('X promotion submit errors cover all locales and map safe status classes', () => {
  for (const locale of supportedLocales) {
    const escaped = locale.replaceAll('-', '\\-');
    const key = locale.includes('-')
      ? "'" + escaped + "'"
      : "(?:'" + escaped + "'|" + escaped + ")";
    const line = submitErrors.match(
      new RegExp("(?:^|\\n)\\s*" + key + "\\s*:\\s*\\{([^\\n]+)\\}", 'm'),
    )?.[1] ?? '';
    assert.ok(line, 'missing submit-error copy for ' + locale);
    for (const field of ['invalidPost','walletAccess','conflict','rateLimited','unavailable']) {
      assert.match(line, new RegExp('\\b' + field + ':'), locale + ' missing ' + field);
    }
  }

  assert.match(submitErrors, /status === 400/);
  assert.match(submitErrors, /status === 401 \|\| status === 403/);
  assert.match(submitErrors, /status === 409/);
  assert.match(submitErrors, /status === 429/);
});

test('X promotion UI keeps API errors localized and long/RTL copy layout-safe', () => {
  assert.match(panel, /rewardXPromotionSubmitError\(locale, response\.status\)/);
  assert.match(panel, /rewardXPromotionSubmitError\(locale, 0\)/);
  assert.doesNotMatch(panel, /body\.error\s*\|\|/);
  assert.doesNotMatch(panel, /error instanceof Error[\s\S]*error\.message/);

  for (const guard of [
    'lang={locale}',
    'dir={direction}',
    'dir="ltr"',
    'overflow-wrap:anywhere',
    'white-space:normal',
    'unicode-bidi:isolate',
    '@media(max-width:430px)',
  ]) {
    assert.ok(panel.includes(guard), 'missing layout guard: ' + guard);
  }
});
