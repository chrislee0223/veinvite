import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const route = readFileSync(new URL('../src/app/api/rewards/x-promotion/route.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/components/RewardXPromotionPanel.tsx', import.meta.url), 'utf8');
const autoCopy = readFileSync(new URL('../src/lib/i18n/rewardXPromotionAutoCopy.ts', import.meta.url), 'utf8');

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
  for (const field of ['connectX', 'connectedX', 'autoConnectBody', 'autoOpenBody', 'autoGraceBody', 'autoConnectedX']) {
    assert.match(autoCopy, new RegExp(field + ':'));
  }
  assert.match(autoCopy, /No post URL is needed/);
  assert.match(autoCopy, /24 hours/);
  assert.match(autoCopy, /게시물 링크를 따로 제출할 필요는 없어요/);
});
