import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const center = read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');
const controller = read('src/components/InAppInviteNotifications.tsx');
const route = read('src/app/api/notifications/history/route.ts');
const claimClient = read('src/lib/rewards/rewardClaimClient.ts');
const polish = read('src/app/notification-history-polish.css');
const hardening = read('src/app/notification-i18n-hardening.css');
const runtimeFix = read('src/app/notification-runtime-ux-fix.css');
const migration = read('supabase/migrations/20260917000500_preserve_paid_receipt_acknowledgement.sql');

test('ordinary cards do not reserve a detached friend-wallet row', () => {
  assert.doesNotMatch(center, /notificationFriendMeta/u);
  assert.doesNotMatch(center, /notificationFriendWallet/u);
  assert.match(center, /const showMeta = Boolean\(copy\.hint \|\| item\.kind === 'REWARD_PAID'\)/u);
  assert.doesNotMatch(polish, /"meta meta"/u);
  assert.match(polish, /notificationHistorySrOnly[\s\S]*clip-path:\s*inset\(50%\)\s*!important/u);
});

test('mark-all preserves unread paid receipts until receipt acknowledgement', () => {
  assert.match(controller, /notification\.kind !== 'REWARD_PAID'/u);
  assert.match(controller, /item\.kind !== 'REWARD_PAID'/u);
  assert.match(controller, /markAllAvailable=\{items\.some/u);
  assert.match(route, /Paid reward notifications must be acknowledged from the reward receipt/u);
  assert.match(migration, /p_through_id is not null[\s\S]*h\.kind <> 'REWARD_PAID'/u);
});

test('receipt requests cannot overwrite a newer or dismissed receipt view', () => {
  assert.match(center, /const receiptRequestRef = useRef\(0\)/u);
  assert.match(center, /const requestId = receiptRequestRef\.current \+ 1/u);
  assert.match(center, /if \(receiptRequestRef\.current !== requestId\) return;/u);
  assert.match(center, /receiptRequestRef\.current \+= 1/u);
});

test('receipt authentication failures invalidate the wallet session consistently', () => {
  const authChecks = center.match(/response\.status === 401 \|\| response\.status === 403/g) ?? [];
  assert.ok(authChecks.length >= 3);
  assert.match(center, /notifyRewardClaimSessionInvalid\(\)/u);
});

test('ambiguous Claim recovery looks up the exact invite receipt instead of only the latest 50', () => {
  assert.match(claimClient, /rewards\/receipts\?inviteCode=\$\{encodeURIComponent\(inviteCode\)\}/u);
  assert.doesNotMatch(claimClient, /rewards\/receipts\?limit=50/u);
});

test('background reward discovery does not impersonate a real reward notification', () => {
  assert.doesNotMatch(hardening, /notificationActionSection:has\(\.notificationActionLoading\)/u);
  assert.match(center, /className="notificationActionLoading"/u);
  assert.match(
    runtimeFix,
    /notificationActionSection:has\(\.notificationActionLoading\):not\(:has\(\.notificationActionCard\)\):not\(:has\(\.notificationActionError\)\)[\s\S]*display:\s*none\s*!important/u,
  );
  assert.doesNotMatch(
    runtimeFix,
    /notificationActionSection:has\(\.notificationActionError\)[\s\S]*display:\s*none/u,
  );
});

test('unread status indicator does not indent the notification title away from the body', () => {
  assert.match(
    runtimeFix,
    /\.notificationHistoryTitleWrap[\s\S]*position:\s*relative\s*!important[\s\S]*gap:\s*0\s*!important/u,
  );
  assert.match(
    runtimeFix,
    /\.notificationUnreadDot[\s\S]*position:\s*absolute\s*!important[\s\S]*inset-inline-start:\s*-10px\s*!important/u,
  );
  assert.match(
    runtimeFix,
    /\.notificationHistoryTitle,[\s\S]*\.notificationHistoryBody[\s\S]*padding-inline-start:\s*0\s*!important/u,
  );
});
