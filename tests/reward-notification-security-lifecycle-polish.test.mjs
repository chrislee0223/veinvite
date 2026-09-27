import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('security notification presentation kinds stay backward compatible', async () => {
  const [types, route] = await Promise.all([
    read('src/lib/notifications/inviteNotificationStateV2.ts'),
    read('src/app/api/notifications/history/route.ts'),
  ]);

  for (const kind of [
    'SECURITY_POST_PAYOUT_REVIEW_STARTED',
    'SECURITY_POST_PAYOUT_REVIEW_CLEARED',
    'SECURITY_REFERRAL_RESTORED',
  ]) {
    assert.match(types, new RegExp(kind));
    assert.match(route, new RegExp(kind));
  }

  assert.match(
    route,
    /SECURITY_POST_PAYOUT_REVIEW_STARTED:\s*'SECURITY_REVIEW_STARTED'/u,
  );
  assert.match(
    route,
    /SECURITY_POST_PAYOUT_REVIEW_CLEARED:\s*'SECURITY_INVITER_ACCESS_RESTORED'/u,
  );
  assert.match(
    route,
    /SECURITY_REFERRAL_RESTORED:\s*'SECURITY_INVITER_ACCESS_RESTORED'/u,
  );
  assert.match(route, /presentationKind:\s*row\.kind/u);
});

test('notification cache and data refresh include invalidation and restoration', async () => {
  const [notifications, networkRoot, networkSummary, network] = await Promise.all([
    read('src/components/InAppInviteNotifications.tsx'),
    read('src/lib/networkRootClientCache.ts'),
    read('src/lib/networkSummaryClientCache.ts'),
    read('src/components/AppNetwork.tsx'),
  ]);

  for (const kind of [
    'SECURITY_REFERRAL_INVALIDATED',
    'SECURITY_REFERRAL_RESTORED',
    'SECURITY_POST_PAYOUT_REVIEW_STARTED',
    'SECURITY_POST_PAYOUT_REVIEW_CLEARED',
  ]) {
    assert.match(notifications, new RegExp(kind));
  }

  assert.match(notifications, /presentationKind/u);
  assert.match(notifications, /invalidateNetworkRootCache\(requestWallet\)/u);
  assert.match(notifications, /invalidateNetworkSummaryCache\(requestWallet\)/u);
  assert.match(notifications, /NETWORK_DATA_REFRESH_REQUESTED_EVENT/u);
  assert.match(networkRoot, /export function invalidateNetworkRootCache/u);
  assert.match(networkSummary, /export function invalidateNetworkSummaryCache/u);
  assert.match(network, /NETWORK_DATA_REFRESH_REQUESTED_EVENT/u);
  assert.match(network, /void loadRoot\(\)/u);
});

test('notification action loading does not insert a transient empty section', async () => {
  const source = await read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');
  const start = source.indexOf('const renderRewardActions = () => {');
  const end = source.indexOf('const receiptViewActive', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const body = source.slice(start, end);

  assert.match(
    body,
    /rewardActions\.length === 0\s*&&\s*!actionError/u,
  );
  assert.doesNotMatch(body, /notificationActionLoading/u);
});

test('security notification QA covers new lifecycle states at narrow mobile width', async () => {
  const [harness, visual] = await Promise.all([
    read('src/qa/QaNotificationStateHarness.tsx'),
    read('tests/playwright/visual-i18n.spec.ts'),
  ]);

  for (const state of [
    'NOTI-POST-PAYOUT-REVIEW',
    'NOTI-POST-PAYOUT-CLEARED',
    'NOTI-REFERRAL-INVALIDATED',
    'NOTI-REFERRAL-RESTORED',
  ]) {
    assert.match(harness, new RegExp(state));
    assert.match(visual, new RegExp(state));
  }
  assert.match(visual, /NARROW_MOBILE_VIEWPORT = \{ width: 320/u);
});

test('reviewed Korean notification copy uses the final wording', async () => {
  const [v2, history, inviter, postPayout, restored] = await Promise.all([
    read('src/lib/i18n/notificationV2Copy.ts'),
    read('src/lib/i18n/notificationHistoryCopy.ts'),
    read('src/lib/i18n/inviterSecurityNotificationCopy.ts'),
    read('src/lib/i18n/postPayoutSecurityNotificationCopy.ts'),
    read('src/lib/i18n/referralRestoredCopy.ts'),
  ]);

  assert.match(v2, /친구가 모든 미션을 완료했어요!/u);
  assert.match(v2, /친구가 dApp을 하나 더 이용해 B3TR 보상까지 받았어요/u);
  assert.match(v2, /여러 친구의 진행 상황이 업데이트됐어요/u);
  assert.match(history, /새로운 소식이 생기면 여기에 표시돼요/u);
  assert.match(inviter, /초대 활동 확인 중/u);
  assert.match(inviter, /VeInvite 이용이 다시 가능해졌어요/u);
  assert.match(postPayout, /보상 지급 후 추가 확인 중/u);
  assert.match(postPayout, /추가 확인이 완료됐어요/u);
  assert.match(restored, /초대 기록이 복구됐어요/u);
});
