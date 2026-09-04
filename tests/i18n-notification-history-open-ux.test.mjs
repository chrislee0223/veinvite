import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const controller = readFileSync(
  'src/components/InAppInviteNotifications.tsx',
  'utf8',
);
const center = readFileSync(
  'src/components/InviteNotificationHistoryCenter.tsx',
  'utf8',
);

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
