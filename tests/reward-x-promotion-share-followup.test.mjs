import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const popup = readFileSync(
  new URL('../src/hooks/useRewardPaidTransientFeedback.ts', import.meta.url),
  'utf8',
);
const baseCopy = readFileSync(
  new URL('../src/lib/i18n/rewardXPromotionCopy.ts', import.meta.url),
  'utf8',
);
const expandedCopy = readFileSync(
  new URL('../src/lib/i18n/rewardXPromotionExpandedCopy.ts', import.meta.url),
  'utf8',
);
const autoCopy = readFileSync(
  new URL('../src/lib/i18n/rewardXPromotionAutoCopy.ts', import.meta.url),
  'utf8',
);
const expandedAutoCopy = readFileSync(
  new URL('../src/lib/i18n/rewardXPromotionExpandedAutoCopy.ts', import.meta.url),
  'utf8',
);
const locales = readFileSync(
  new URL('../src/lib/i18n/locales.ts', import.meta.url),
  'utf8',
);

test('X sharing keeps the existing no-expired-bonus protection', () => {
  assert.match(popup, /shareDeadlineMs !== null && Date\.now\(\) >= shareDeadlineMs/);
  assert.match(popup, /shareExpiryTimerRef/);
  assert.match(popup, /onShare: undefined/);
});

test('reward popup distinguishes manual URL verification from automatic discovery', () => {
  const handler = /onShare: \(\) => \{([\s\S]*?)\n\s*\},\n\s*\}/.exec(popup);
  assert.ok(handler);
  assert.match(handler[1], /window\.open\(/);
  assert.match(handler[1], /autoShareFollowup/);
  assert.match(
    handler[1],
    /REWARD_X_PROMOTION_COPY\[locale\]\.autoShareFollowupBody/,
  );
  assert.match(
    handler[1],
    /REWARD_X_PROMOTION_COPY\[locale\]\.shareFollowupBody/,
  );
  assert.doesNotMatch(handler[1], /acknowledgeReward\(/);
  assert.doesNotMatch(handler[1], /\/api\/rewards\/claims/);
  assert.match(popup, /ACKNOWLEDGE_REWARD_RECEIPT/);
});

test('URL-less promotion share is unavailable until the X account is connected', () => {
  assert.match(popup, /xUrlLessEnabled\?: boolean/);
  assert.match(popup, /xConnected\?: boolean/);
  assert.match(popup, /const usesAuto =\s*body\.xUrlLessEnabled === true/);
  assert.match(
    popup,
    /const canSharePromotion =\s*!usesAuto \|\|\s*body\.xConnected === true/,
  );
  assert.match(popup, /if \(canSharePromotion\) \{/);
});

test('manual and automatic follow-up translations cover all 29 registered locales', () => {
  const registered = Array.from(
    locales.matchAll(/\{ locale: '([^']+)'/g),
    (m) => m[1],
  );
  assert.equal(registered.length, 29);

  const coreSources = baseCopy + '\n' + expandedCopy;
  const autoSources = autoCopy + '\n' + expandedAutoCopy;

  assert.match(baseCopy, /shareFollowupBody: string/);
  assert.match(
    baseCopy,
    /paste the public post URL to verify your bonus/,
  );
  assert.match(
    baseCopy,
    /공개 게시물 링크를 제출해 추가 보상을 인증하세요/,
  );

  assert.match(autoCopy, /autoShareFollowupBody: string/);
  assert.match(autoCopy, /No URL submission is needed/);
  assert.match(autoCopy, /URL을 따로 제출할 필요는 없어요/);

  for (const locale of registered) {
    const localePattern = new RegExp(
      '(?:^|\\n)\\s*[\\x27\\x22]?' +
        locale +
        '[\\x27\\x22]?\\s*:',
      'm',
    );
    assert.match(
      coreSources,
      localePattern,
      'missing core X promotion locale: ' + locale,
    );
    assert.match(
      autoSources,
      localePattern,
      'missing automatic X promotion locale: ' + locale,
    );
  }

  assert.doesNotMatch(coreSources, /\.\.\.EN\b/);
  assert.doesNotMatch(autoSources, /\.\.\.EN\b/);
});
