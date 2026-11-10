import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const popup = read('src/hooks/useRewardPaidTransientFeedback.ts');
const auto = read('src/lib/i18n/rewardXPromotionAutoCopyA.ts')
  + '\n' + read('src/lib/i18n/rewardXPromotionAutoCopyB.ts');
const locales = read('src/lib/i18n/locales.ts');

test('X composer follow-up is automatic-only and never requests URL submission', () => {
  const handler = /onShare: \(\) => \{([\s\S]*?)\n\s*\},\n\s*\}/.exec(popup);
  assert.ok(handler);
  assert.match(handler[1], /window\.open\(/);
  assert.match(handler[1], /REWARD_X_PROMOTION_AUTO_COPY\[locale\]\.autoShareFollowupBody/);
  assert.doesNotMatch(handler[1], /REWARD_X_PROMOTION_COPY|postUrl/);
  assert.doesNotMatch(handler[1], /acknowledgeReward\(/);
  assert.match(popup, /ACKNOWLEDGE_REWARD_RECEIPT/);
});

test('automatic follow-up guidance covers all 29 application languages', () => {
  const registered = [...locales.matchAll(/\{ locale: '([^']+)'/g)].map(m => m[1]);
  assert.equal(registered.length, 29);
  for (const locale of registered) {
    assert.match(auto, new RegExp('(?:^|\\n)\\s*[\\x27\\x22]?' + locale + '[\\x27\\x22]?\\s*:'), 'missing locale ' + locale);
  }
  assert.equal((auto.match(/^\s*autoShareFollowupBody:/gm) ?? []).length, 29);
  assert.match(auto, /X에 게시했다면 링크 제출이나 별도 확인은 필요 없어요/);
  assert.doesNotMatch(auto, /^\s*connectedX:/m);
});
