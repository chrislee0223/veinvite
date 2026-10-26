import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const popup = readFileSync(new URL('../src/hooks/useRewardPaidTransientFeedback.ts', import.meta.url), 'utf8');
const copy = readFileSync(new URL('../src/lib/i18n/rewardXPromotionCopy.ts', import.meta.url), 'utf8');
const copyExpandedA = readFileSync(new URL('../src/lib/i18n/rewardXPromotionExpandedCopyA.ts', import.meta.url), 'utf8');
const copyExpandedB = readFileSync(new URL('../src/lib/i18n/rewardXPromotionExpandedCopyB.ts', import.meta.url), 'utf8');
const allCopy = copy + '\n' + copyExpandedA + '\n' + copyExpandedB;
const locales = readFileSync(new URL('../src/lib/i18n/locales.ts', import.meta.url), 'utf8');

test('X sharing keeps the existing no-expired-bonus protection', () => {
  assert.match(popup, /shareDeadlineMs !== null && Date\.now\(\) >= shareDeadlineMs/);
  assert.match(popup, /shareExpiryTimerRef/);
  assert.match(popup, /onShare: undefined/);
});

test('after opening X composer, reward popup explains how to submit the public Post URL', () => {
  const handler = /onShare: \(\) => \{([\s\S]*?)\n\s*\},\n\s*\}/.exec(popup);
  assert.ok(handler);
  assert.match(handler[1], /window\.open\(/);
  assert.match(handler[1], /REWARD_X_PROMOTION_COPY\[locale\]\.shareFollowupBody/);
  assert.doesNotMatch(handler[1], /acknowledgeReward\(/);
  assert.doesNotMatch(handler[1], /\/api\/rewards\/claims/);
  assert.match(popup, /ACKNOWLEDGE_REWARD_RECEIPT/);
});

test('share-followup translations cover all 29 registered app locales', () => {
  const registered = Array.from(locales.matchAll(/\{ locale: '([^']+)'/g), (m) => m[1]);
  assert.equal(registered.length, 29);
  assert.match(copy, /shareFollowupBody: string/);
  assert.match(copy, /return to VeInvite\. Open your reward in Notifications/);
  assert.match(copy, /X에 게시한 뒤 VeInvite로 돌아와/);
  for (const locale of registered) {
    assert.match(allCopy, new RegExp('(?:^|\\n)\\s*[\\x27\\x22]?' + locale + '[\\x27\\x22]?\\s*:'), 'missing locale: ' + locale);
  }
  assert.equal((allCopy.match(/shareFollowupBody:/g) ?? []).length, 30);
});
