import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const notifications = read('src/components/InAppInviteNotifications.tsx');
const facade = read('src/components/InviteNotificationHistoryCenter.tsx');
const center = read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');
const paidSync = read('src/components/PaidActivationLiveSync.tsx');
const activeReceipt = read('src/components/ActiveWalletRewardReceiptNotice.tsx');
const home = read('src/components/HomeClient.tsx');

test('notification center keeps Claim ownership out of the bell', () => {
  assert.match(facade, /UnifiedInviteNotificationHistoryCenter/u);
  assert.doesNotMatch(facade, /RewardActionItem/u);
  assert.doesNotMatch(facade, /reward-actions/u);
  assert.doesNotMatch(center, /initialRewardActions/u);
  assert.doesNotMatch(center, /notificationClaimButton/u);
});

test('programmatic notification opens stay hidden until the user opens the bell', () => {
  assert.match(center, /allowProgrammaticOpen = false/u);
  assert.match(center, /const \[manualOpen, setManualOpen\] = useState\(false\)/u);
  assert.match(
    center,
    /const visibleOpen = open && \(manualOpen \|\| allowProgrammaticOpen\)/u,
  );
  assert.match(center, /setManualOpen\(true\);[\s\S]*onOpen\(\)/u);
});

test('Home remains the only visible Claim workflow', () => {
  assert.match(home, /className="claimButton"/u);
  assert.match(home, /fetch\('\/api\/rewards\/claims'/u);
  assert.doesNotMatch(center, /HOME_DATA_REFRESH_REQUESTED_EVENT/u);
  assert.doesNotMatch(center, /fetch\('\/api\/rewards\/claims'/u);
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
