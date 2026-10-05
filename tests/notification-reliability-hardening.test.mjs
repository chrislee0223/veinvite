import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const controller = read('src/components/InAppInviteNotifications.tsx');
const center = read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');
const facade = read('src/components/InviteNotificationHistoryCenter.tsx');
const historyRoute = read('src/app/api/notifications/history/route.ts');
const receiptRoute = read('src/app/api/rewards/receipts/route.ts');

test('first uncached notification open shows loading until initial history resolves', () => {
  assert.match(controller, /const historyResolvedRef = useRef\(false\)/);
  assert.match(controller, /historyResolvedRef\.current = cached !== null/);
  assert.match(controller, /historyResolvedRef\.current = true/);
  assert.match(controller, /const visibleLoading = !historyResolvedRef\.current/);
  assert.match(controller, /visibleLoading,\s*\n\s*surfaceError: true/);
});

test('notification acknowledgement uses authoritative remaining unread count', () => {
  assert.match(historyRoute, /acknowledge_invite_notification_history/);
  assert.match(historyRoute, /count_invite_notification_history_unread/);
  assert.match(historyRoute, /unreadCount: Number\(unreadResult\.data \?\? 0\)/);
  assert.match(controller, /const nextUnreadCount = acknowledgement\.unreadCount/g);
  assert.doesNotMatch(controller, /unreadCount - unreadThroughSnapshot\.length/);
});

test('history loading, emptiness and errors stay distinguishable without Claim UI', () => {
  assert.match(center, /loading && sorted\.length === 0/);
  assert.match(center, /errorMessage && sorted\.length === 0/);
  assert.match(center, /sorted\.length === 0 \? \(/);
  assert.doesNotMatch(center, /rewardActions/);
  assert.doesNotMatch(center, /notificationActionLoading/);
});

test('paid notification receipt lookup is exact, wallet-scoped, and not capped to recent 50', () => {
  assert.match(receiptRoute, /const INVITE_CODE_PATTERN/);
  assert.match(receiptRoute, /parseInviteCode/);
  assert.match(receiptRoute, /\.eq\('recipient_wallet', walletAddress\)/);
  assert.match(receiptRoute, /\.eq\('invite_code', inviteCode\)/);
  assert.match(
    center,
    /rewards\/receipts\?inviteCode=\$\{encodeURIComponent\(item\.inviteCode\)\}/,
  );
  assert.doesNotMatch(center, /rewards\/receipts\?limit=50/);
});

test('notification facade has no separate reward-attention polling path', () => {
  assert.match(facade, /UnifiedInviteNotificationHistoryCenter/);
  assert.doesNotMatch(facade, /reward-actions/);
  assert.doesNotMatch(facade, /notificationRewardAttentionDot/);
});
