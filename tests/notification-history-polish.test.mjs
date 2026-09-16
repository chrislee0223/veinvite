import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync(
  new URL('../src/app/layout.tsx', import.meta.url),
  'utf8',
);
const polish = readFileSync(
  new URL('../src/app/notification-history-polish.css', import.meta.url),
  'utf8',
);
const center = readFileSync(
  new URL('../src/components/UnifiedInviteNotificationHistoryCenter.tsx', import.meta.url),
  'utf8',
);

test('notification polish is loaded globally after existing notification hardening', () => {
  assert.match(layout, /import '\.\/notification-i18n-hardening\.css';/u);
  assert.match(layout, /import '\.\/notification-history-polish\.css';/u);
  assert.ok(
    layout.indexOf("import './notification-history-polish.css';") >
      layout.indexOf("import './notification-i18n-hardening.css';"),
  );
});

test('ordinary notification cards keep event time in a stable top-right position', () => {
  assert.match(polish, /\.notificationHistoryPanel \.notificationHistoryGroup > div[\s\S]*display:\s*grid\s*!important/u);
  assert.match(polish, /\.notificationHistoryPanel \.notificationHistoryRow[\s\S]*border-radius:\s*14px\s*!important/u);
  assert.match(polish, /grid-template-areas:[\s\S]*"title time"[\s\S]*"body body"[\s\S]*"meta meta"\s*!important/u);
  assert.match(polish, /\.notificationHistoryTopLine[\s\S]*display:\s*contents\s*!important/u);
  assert.match(polish, /\.notificationHistoryBody[\s\S]*padding-inline-start:\s*0\s*!important/u);
  assert.match(polish, /\.notificationHistoryMeta[\s\S]*padding-inline-start:\s*0\s*!important/u);
});

test('long translations and RTL-safe logical spacing remain first-class', () => {
  assert.match(polish, /overflow-wrap:\s*anywhere\s*!important/u);
  assert.match(polish, /word-break:\s*normal\s*!important/u);
  assert.match(polish, /padding-inline:/u);
  assert.match(polish, /margin-inline:/u);
  assert.doesNotMatch(polish, /\b(?:left|right):\s*\d/u);
  assert.match(center, /dir=\{rtl \? 'rtl' : 'ltr'\}/u);
});

test('reward actions keep Claim and processing controls separate while matching card geometry', () => {
  assert.match(polish, /\.notificationHistoryPanel \.notificationActionSection[\s\S]*border-radius:\s*16px\s*!important/u);
  assert.match(polish, /\.notificationHistoryPanel \.notificationActionCard[\s\S]*border-radius:\s*14px\s*!important/u);
  assert.match(polish, /\.notificationClaimButton,[\s\S]*\.notificationProcessingBadge/u);
  assert.match(center, /className="notificationClaimButton"/u);
  assert.match(center, /className="notificationProcessingBadge"/u);
});

test('mobile cards, Claim actions and narrow translated layouts remain usable', () => {
  assert.match(polish, /@media \(max-width:\s*560px\)/u);
  assert.match(polish, /\.notificationClaimButton,[\s\S]*width:\s*100%\s*!important/u);
  assert.match(polish, /@media \(max-width:\s*350px\)[\s\S]*"title time"[\s\S]*"body body"[\s\S]*"meta meta"/u);
});

test('presentation polish does not replace notification behavior ownership', () => {
  assert.match(center, /if \(paid\) \{[\s\S]*void openRewardReceipt\(item\)/u);
  assert.match(center, /if \(unread\) void onMarkRead\(item\.id\)/u);
  assert.match(center, /fetch\('\/api\/rewards\/claims',[\s\S]*method:\s*'POST'/u);
  assert.match(center, /reconcileRewardClaimState\(\s*action\.inviteCode/u);
  assert.match(center, /document\.body\.style\.overflow = 'hidden'/u);
  assert.match(center, /event\.key === 'Escape'/u);
});
