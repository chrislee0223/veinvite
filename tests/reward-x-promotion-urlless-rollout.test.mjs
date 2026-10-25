import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const route = readFileSync(new URL('../src/app/api/rewards/x-promotion/route.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/components/RewardXPromotionPanel.tsx', import.meta.url), 'utf8');
const copy = readFileSync(new URL('../src/lib/i18n/rewardXPromotionCopy.ts', import.meta.url), 'utf8');
const autoCoreCopy = readFileSync(new URL('../src/lib/i18n/rewardXPromotionAutoCoreCopy.ts', import.meta.url), 'utf8');
const autoExpandedCopy = readFileSync(new URL('../src/lib/i18n/rewardXPromotionAutoExpandedCopy.ts', import.meta.url), 'utf8');
const allAutoCopy = copy + '\n' + autoCoreCopy + '\n' + autoExpandedCopy;
const popup = readFileSync(new URL('../src/hooks/useRewardPaidTransientFeedback.ts', import.meta.url), 'utf8');

test('manual URL retirement requires a separate live + time-bounded rollout gate', () => {
  assert.match(route, /VEINVITE_X_PROMOTION_URLLESS_START_AT/);
  assert.match(route, /VEINVITE_X_PROMOTION_DISCOVERY_MODE === 'live'/);
  assert.match(route, /VEINVITE_X_PROMOTION_DISCOVERY_STRATEGY === 'author'/);
  assert.match(route, /VEINVITE_X_PROMOTION_DAILY_READ_CALLS/);
  assert.match(route, /xConnectAvailable &&/);
  assert.match(route, /Number\.isFinite\(urlLessStart\)/);
  assert.match(route, /Date\.parse\(opportunityRow\.opened_at\) >= urlLessStart/);
  assert.match(route, /xUrlLessEnabled: urlLessConfigured/);
});

test('URL-less mode requires account link before publishing a qualifying share', () => {
  assert.match(panel, /state\?\.xUrlLessEnabled === true && state\?\.xConnected !== true/);
  assert.match(panel, /state\?\.xUrlLessEnabled === true/);
  assert.match(panel, /canSubmit && !usesAuto/);
  assert.match(panel, /\/api\/rewards\/x-promotion\/x-connect\/start/);
});

test('existing URL submit path remains available for legacy and disabled cohorts', () => {
  assert.match(panel, /\/api\/rewards\/x-promotion\/submit/);
  assert.match(panel, /canSubmit && !usesAuto/);
});

test('auto-only instructions explain public X connection, detection and 24-hour retention', () => {
  for (const field of ['autoConnectBody', 'autoOpenBody', 'autoGraceBody', 'autoConnectedX']) {
    assert.match(allAutoCopy, new RegExp(field + ':'));
  }
  assert.match(allAutoCopy, /No post URL is needed/i);
  assert.match(allAutoCopy, /24 hours/);
  assert.match(allAutoCopy, /게시물 URL을 따로 제출할 필요가 없어요/);
});

test('automatic cohort reward popup never requires a URL or a return to VeInvite', () => {
  assert.match(popup, /xUrlLessEnabled\?: boolean/);
  assert.match(popup, /xConnected\?: boolean/);
  assert.match(popup, /const usesAuto = body\.xUrlLessEnabled === true/);
  assert.match(popup, /!usesAuto \|\| body\.xConnected === true/);
  assert.match(popup, /autoShareFollowup = usesAuto/);
  assert.match(popup, /text: autoShareFollowup/);
  assert.match(popup, /REWARD_X_PROMOTION_COPY\[locale\]\.autoShareFollowupBody/);
  assert.match(allAutoCopy, /autoShareFollowupBody:/);
  assert.match(allAutoCopy, /X에 게시한 뒤에는 URL 제출이나 추가 확인이 필요 없어요/);
  assert.match(popup, /REWARD_X_PROMOTION_COPY\[locale\]\.autoOpenBody/);
  assert.match(popup, /: REWARD_X_PROMOTION_COPY\[locale\]\.shareFollowupBody/);
  assert.doesNotMatch(popup, /scan-request|I posted on X|X에 게시했어요/u);
});

test('manual verification remains confined to historical offers, not automatic cohorts', () => {
  assert.match(panel, /canSubmit && !usesAuto/);
  assert.match(panel, /state\?\.xUrlLessEnabled === true/);
  assert.match(route, /Date\.parse\(opportunityRow\.opened_at\) >= urlLessStart/);
  assert.match(popup, /!usesAuto \|\| body\.xConnected === true/);
  assert.match(copy, /shareFollowupBody:/);
  assert.match(allAutoCopy, /autoOpenBody:/);
});
