import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const notifications = read('src/components/InAppInviteNotifications.tsx');
const facade = read('src/components/InviteNotificationHistoryCenter.tsx');
const center = read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');
const paidSync = read('src/components/PaidActivationLiveSync.tsx');
const activeReceipt = read('src/components/ActiveWalletRewardReceiptNotice.tsx');

test('notification center reuses the bell reward-action snapshot before background revalidation', () => {
  assert.match(facade, /useState<RewardActionItem\[\] \| null>\(null\)/u);
  assert.match(facade, /initialRewardActions=\{rewardActions\}/u);
  assert.match(facade, /onRewardActionsChange=\{setRewardActions\}/u);
  assert.match(center, /initialRewardActions \?\? \[\]/u);
  assert.match(center, /actionResolvedRef\.current = true/u);
});

test('notification auto-open yields to wallet and app dialogs', () => {
  assert.match(notifications, /isWalletModalOpen/u);
  assert.match(notifications, /function hasBlockingDialogOpen\(\)/u);
  assert.match(notifications, /notificationCenterIsClosing\(\)/u);
  assert.match(
    notifications,
    /const blocked =\s*isWalletModalOpen \|\|\s*hasBlockingDialogOpen\(\) \|\|\s*notificationCenterIsClosing\(\)/u,
  );
  assert.match(
    notifications,
    /onOpen=\{\(\) => \{\s*if \(isWalletModalOpen \|\| hasBlockingDialogOpen\(\)\)/u,
  );
});

test('notification Claim immediately asks Home to reconcile its reward card', () => {
  assert.match(center, /HOME_DATA_REFRESH_REQUESTED_EVENT/u);
  const dispatches = center.match(
    /new Event\(HOME_DATA_REFRESH_REQUESTED_EVENT\)/gu,
  ) ?? [];
  assert.ok(dispatches.length >= 2);
});

test('paid-state reload waits until modal work is finished', () => {
  assert.match(paidSync, /SAFE_RELOAD_RETRY_MS/u);
  assert.match(paidSync, /function hasBlockingDialogOpen\(\)/u);
  assert.match(paidSync, /const scheduleSafeReload = useCallback/u);
  assert.doesNotMatch(
    paidSync,
    /reloadRequestedRef\.current = true;\s*window\.location\.reload\(\)/u,
  );
});

test('standalone paid receipt popup is removed while paid live sync remains mounted', () => {
  assert.match(activeReceipt, /PaidActivationLiveSync/u);
  assert.equal(
    activeReceipt.includes('import { RewardReceiptNotice }'),
    false,
  );
  assert.equal(activeReceipt.includes('<RewardReceiptNotice'), false);
});
