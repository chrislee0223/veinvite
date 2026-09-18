import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const controller = readFileSync(
  'src/components/InAppInviteNotifications.tsx',
  'utf8',
);
const center = [
  readFileSync(
    'src/components/InviteNotificationHistoryCenter.tsx',
    'utf8',
  ),
  readFileSync(
    'src/components/UnifiedInviteNotificationHistoryCenter.tsx',
    'utf8',
  ),
].join('\n');

test('notification history opens from a warm session cache without forcing a visible loader', () => {
  assert.match(controller, /HISTORY_CACHE_PREFIX/);
  assert.match(controller, /window\.sessionStorage\.getItem/);
  assert.match(controller, /window\.sessionStorage\.setItem/);
  assert.match(controller, /const cached = wallet \? readHistoryCache\(wallet\) : null/);

  const openHandler = controller.split('onOpen={() => {')[1]?.split('onClose={() =>')[0] ?? '';
  assert.ok(openHandler.length > 0);
  assert.doesNotMatch(openHandler, /visibleLoading:\s*true/);
  assert.match(openHandler, /surfaceError:\s*true/);
  assert.match(openHandler, /void refreshLifecycle\(false\)/);
});

test('opening the notification dialog focuses the panel without painting the close-button focus ring', () => {
  assert.match(center, /panelRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(center, /tabIndex=\{-1\}/);
  assert.match(center, /\.notificationHistoryPanel:focus\{outline:none\}/);
  assert.doesNotMatch(center, /closeRef\.current\?\.focus/);
  assert.doesNotMatch(center, /ref=\{closeRef\}/);

  // Keyboard users still receive a visible ring once they tab onto a real control.
  assert.match(center, /\.notificationHistoryClose:focus-visible/);
  assert.match(center, /FOCUSABLE_SELECTOR/);
});


test('reward action loading is present before the notification panel first paints', () => {
  assert.match(center, /useLayoutEffect/);
  assert.match(
    center,
    /useLayoutEffect\(\(\) => \{[\s\S]*void loadRewardActions\(\)/,
  );
  assert.doesNotMatch(
    center,
    /setRewardActions\(\[\]\)[\s\S]{0,260}if \(!open\)/,
  );
  assert.match(center, /\.notificationActionLoading\{min-height:72px/);
});


test('notification center opens as one fixed frame instead of growing after the header paints', () => {
  assert.match(center, /className="notificationHistoryBodyFrame"/);
  assert.match(
    center,
    /\.notificationHistoryPanel\{[^}]*height:min\(610px,calc\(100dvh - 92px\)\)/,
  );
  assert.match(center, /display:flex;flex-direction:column/);
  assert.match(center, /\.notificationHistoryBodyFrame\{flex:1 1 auto;min-height:0;overflow:hidden\}/);
  assert.match(center, /\.notificationHistoryScroll,\.notificationReceiptView\{height:100%;max-height:none/);
  assert.match(center, /\.notificationHistoryState\{height:100%;min-height:0;box-sizing:border-box/);
  assert.match(
    center,
    /@media\(max-width:560px\)[\s\S]*\.notificationHistoryPanel\{[^}]*height:calc\(74dvh - env\(safe-area-inset-bottom\)\)/,
  );
});
