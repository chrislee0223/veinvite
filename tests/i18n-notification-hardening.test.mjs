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

test('notification QA lab includes the new terminal ineligible scenario', () => {
  assert.match(preview, /kind:\s*'INVITE_INELIGIBLE',\s*stage:\s*6/);
  assert.match(preview, /id:\s*'ineligible'/);
});

test('reading the rich reward receipt also clears the duplicate paid bell notification', () => {
  assert.match(receiptSeenRoute, /acknowledge_invite_notification/);
  assert.match(receiptSeenRoute, /INVITE_NOTIFICATION_STAGE\.rewardPaid/);
  assert.match(receipt, /veinvite-reward-receipt-acknowledged/);
  assert.match(receipt, /window\.dispatchEvent/);
  assert.match(notifications, /veinvite-reward-receipt-acknowledged/);
  assert.match(notifications, /void refresh\(false\)/);
});
