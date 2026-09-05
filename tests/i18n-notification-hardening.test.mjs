import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const locales = read('src/lib/i18n/locales.ts');
const ineligibleCopy = read('src/lib/i18n/ineligibleInviterCopy.ts');
const hardening = read('src/app/notification-i18n-hardening.css');
const layout = read('src/app/layout.tsx');
const preview = read('src/components/NotificationUiPreview.tsx');
const receipt = read('src/components/RewardReceiptNotice.tsx');
const notifications = read('src/components/InAppInviteNotifications.tsx');
const receiptSeenRoute = read('src/app/api/rewards/receipts/[id]/seen/route.ts');

const supportedLocales = [...locales.matchAll(/\{ locale: '([^']+)'/g)].map(
  (match) => match[1],
);

const translatedLocales = [...ineligibleCopy.matchAll(
  /^\s*(?:'([^']+)'|([a-z]+)):\s*\{/gmu,
)]
  .map((match) => match[1] ?? match[2])
  .filter((locale) => supportedLocales.includes(locale));

test('latest ineligible-invite notification stays explicitly translated for all 27 locales', () => {
  assert.equal(supportedLocales.length, 27);
  assert.deepEqual(
    [...new Set(translatedLocales)].sort(),
    [...supportedLocales].sort(),
  );
  assert.equal(translatedLocales.length, supportedLocales.length);

  assert.match(
    ineligibleCopy,
    /Your friend does not currently meet VeInvite participation requirements, so this invite has ended/,
  );
  assert.doesNotMatch(
    ineligibleCopy,
    /The friend who checked this invite/,
  );
});

test('notification layout protects long translations and short viewports', () => {
  assert.match(layout, /notification-i18n-hardening\.css/);
  assert.match(hardening, /\.notificationRoot \.notificationCard \{[\s\S]*max-height:/);
  assert.match(hardening, /overflow-y:\s*auto/);
  assert.match(hardening, /overscroll-behavior:\s*contain/);
  assert.match(hardening, /html\[lang='ko'\]/);
  assert.match(hardening, /\[lang='zh-tw'\]/);
  assert.match(hardening, /line-break:\s*strict/);
  assert.match(hardening, /html\[dir='rtl'\]/);
});

test('fixed notification surfaces avoid compositor-heavy backdrop blur', () => {
  assert.match(
    hardening,
    /\.notificationBackdrop,[\s\S]*\.transientSnackbar[\s\S]*backdrop-filter:\s*none\s*!important/,
  );
  assert.match(hardening, /-webkit-backdrop-filter:\s*none\s*!important/);
});

test('notification QA lab tracks the same v2 lifecycle as Production', () => {
  assert.match(preview, /InviteNotificationSurfaceV2/);
  assert.match(preview, /kind:\s*'DAPP_PROGRESS'/);
  assert.match(preview, /kind:\s*'REWARD_READY',\s*stage:\s*4/);
  assert.match(preview, /kind:\s*'INVITE_INELIGIBLE',\s*stage:\s*6/);
  assert.match(preview, /id:\s*'ineligible'/);
  assert.doesNotMatch(preview, /DAPP_MISSION_COMPLETED/);
  assert.doesNotMatch(preview, /ALL_MISSIONS_COMPLETED/);
  assert.doesNotMatch(preview, /InviteNotificationSurface\s*[,}]/);
});

test('reading the rich reward receipt also clears the duplicate paid bell notification', () => {
  assert.match(receiptSeenRoute, /acknowledge_invite_notification/);
  assert.match(receiptSeenRoute, /INVITE_NOTIFICATION_STAGE\.rewardPaid/);
  assert.match(receipt, /veinvite-reward-receipt-acknowledged/);
  assert.match(receipt, /window\.dispatchEvent/);
  assert.match(notifications, /veinvite-reward-receipt-acknowledged/);
  assert.match(notifications, /void loadLatestHistory\(\{ requestWallet: wallet \}\)/);
  assert.match(notifications, /void refreshLifecycle\(false\)/);
});

test('notification lifecycle coalesces reload bursts and persists unauthorized backoff', () => {
  assert.match(
    notifications,
    /const LIFECYCLE_UNAUTHORIZED_BACKOFF_MS = 15_000;/,
  );
  assert.match(
    notifications,
    /const LIFECYCLE_REQUEST_LEASE_MS = 5_000;/,
  );
  assert.match(
    notifications,
    /const LIFECYCLE_UNAUTHORIZED_BACKOFF_STORAGE_KEY =/,
  );
  assert.match(
    notifications,
    /const LIFECYCLE_REQUEST_LEASE_STORAGE_KEY =/,
  );
  assert.match(
    notifications,
    /window\.localStorage\.getItem\(key\)/,
  );
  assert.match(
    notifications,
    /window\.localStorage\.setItem\(key, String\(value\)\)/,
  );
  assert.match(
    notifications,
    /function acquireLifecycleRequestLease\(\): number \| null \{[\s\S]*if \(now < lifecycleRequestLeaseUntil\) return null;/,
  );
  assert.match(
    notifications,
    /const lifecycleLease = acquireLifecycleRequestLease\(\);\s*if \(lifecycleLease === null\) return;/,
  );
  assert.match(
    notifications,
    /releaseLifecycleRequestLease\(lifecycleLease\);/,
  );
  assert.match(
    notifications,
    /if \(notificationResponse\.status === 401\) \{\s*backOffLifecycleAfterUnauthorized\(\);\s*invalidateWalletSession\(\);\s*return;/,
  );
  assert.match(
    notifications,
    /fetch\(\s*`\/api\/notifications\/history\?\$\{params\.toString\(\)\}`[\s\S]*if \(response\.status === 401\) \{\s*backOffLifecycleAfterUnauthorized\(\);\s*invalidateWalletSession\(\);/,
  );
});
