import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const route = read('src/app/api/rewards/x-promotion/route.ts');
const panel = read('src/components/RewardXPromotionPanel.tsx');
const autoCopy = read('src/lib/i18n/rewardXPromotionAutoCopyA.ts')
  + read('src/lib/i18n/rewardXPromotionAutoCopyB.ts');
const popup = read('src/hooks/useRewardPaidTransientFeedback.ts');

test('automatic X verification remains behind live, author and dated offer gates', () => {
  assert.match(route, /VEINVITE_X_PROMOTION_URLLESS_START_AT/);
  assert.match(route, /VEINVITE_X_PROMOTION_DISCOVERY_MODE === 'live'/);
  assert.match(route, /VEINVITE_X_PROMOTION_DISCOVERY_STRATEGY === 'author'/);
  assert.match(route, /VEINVITE_X_PROMOTION_DAILY_READ_CALLS/);
  assert.match(route, /xConnectAvailable &&/);
  assert.match(route, /Date\.parse\(opportunityRow\.opened_at\) >= urlLessStart/);
  assert.match(route, /xUrlLessEnabled: urlLessConfigured/);
});

test('an unlinked or unready offer never gets an incentive-qualified X composer', () => {
  assert.match(panel, /state\?\.xUrlLessEnabled !== true \|\|/);
  assert.match(panel, /state\?\.xConnected !== true \|\|/);
  assert.match(panel, /x-connect\/start/);
  assert.match(popup, /usesAuto && body\.xConnected === true/);
  assert.match(popup, /if \(body\.xUrlLessEnabled !== true\) return/);
});

test('manual URL form cannot appear for any offer cohort', () => {
  assert.doesNotMatch(panel, /x-promotion\/submit|postUrl|promotionSubmit|canSubmit/);
  assert.match(panel, /: copy\.preparingBody/);
  assert.match(panel, /autoCopy\.autoOpenBody/);
  assert.match(panel, /autoCopy\.autoGraceBody/);
});

test('automatic X guidance covers linked author, 24-hour posting and retention', () => {
  for (const field of ['autoConnectBody', 'autoOpenBody', 'autoGraceBody', 'autoConnectedX', 'autoShareFollowupBody']) {
    assert.match(autoCopy, new RegExp(field + ':'));
  }
  assert.match(autoCopy, /24 hours/);
  assert.match(autoCopy, /게시물을 24시간 이상 공개로 유지해 주세요/);
  assert.doesNotMatch(autoCopy, /^\s*connectedX:/m);
  assert.doesNotMatch(popup, /REWARD_X_PROMOTION_COPY|shareFollowupBody\s*\?/);
});

test('removed manual HTTP endpoint cannot bypass linked-author verification', () => {
  assert.equal(existsSync(new URL('../src/app/api/rewards/x-promotion/submit/route.ts', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/lib/i18n/rewardXPromotionSubmitErrorCopy.ts', import.meta.url)), false);
  const discovery = read('src/lib/rewards/rewardXPromotionAutoDiscovery.ts');
  assert.match(discovery, /record_reward_x_promotion_post_submission_v1/);
  assert.match(discovery, /boundAuthors/);
});
