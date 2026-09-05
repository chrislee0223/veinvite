import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const center = readFileSync(
  'src/components/InviteNotificationHistoryCenter.tsx',
  'utf8',
);

test('notification history opens and closes with matched backdrop and panel motion', () => {
  assert.match(center, /notificationHistoryBackdropIn/);
  assert.match(center, /notificationHistoryBackdropOut/);
  assert.match(center, /notificationHistoryPanelIn/);
  assert.match(center, /notificationHistoryPanelOut/);
  assert.match(center, /notificationHistoryBackdrop isClosing/);
  assert.match(center, /notificationHistoryPanel isClosing/);
  assert.match(center, /setClosing\(true\)/);
  assert.match(
    center,
    /setTimeout\(\s*finishClose,\s*NOTIFICATION_CLOSE_FALLBACK_MS/,
  );
  assert.match(center, /onAnimationEnd=\{\(event\) => \{/);
  assert.match(center, /event\.target === event\.currentTarget/);
});

test('exit completion follows the real panel animation with a timer only as fallback', () => {
  assert.match(center, /NOTIFICATION_CLOSE_FALLBACK_MS = 350/);
  assert.match(
    center,
    /closing &&[\s\S]*event\.target === event\.currentTarget[\s\S]*finishClose\(\);/,
  );
  assert.doesNotMatch(center, /NOTIFICATION_CLOSE_MS = 180/);
});

test('closing keeps focus and scroll ownership stable until the exit motion completes', () => {
  assert.match(center, /const onCloseRef = useRef\(onClose\)/);
  assert.match(center, /onCloseRef\.current\(\);[\s\S]*restoreBellFocus\(\);/);
  assert.match(center, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(
    center,
    /if \(!open \|\| closeTimerRef\.current !== null\) return/,
  );
  assert.doesNotMatch(center, /\[closing,\s*finishClose,\s*open\]/);
});

test('closing backdrop continues intercepting taps without becoming an extra focus target', () => {
  assert.match(
    center,
    /<div\s+className=\{[\s\S]*notificationHistoryBackdrop isClosing[\s\S]*aria-hidden="true"[\s\S]*onClick=\{closePanel\}/,
  );
  assert.doesNotMatch(
    center,
    /\.notificationHistoryBackdrop\.isClosing\{[^}]*pointer-events:none/,
  );
  assert.match(
    center,
    /\.notificationHistoryPanel\.isClosing\{[^}]*pointer-events:none/,
  );
});

test('read notifications are static rows while unread notifications remain actionable', () => {
  assert.match(center, /if \(!unread\) \{[\s\S]*<div[\s\S]*notificationHistoryRow isRead/);
  assert.match(center, /<button[\s\S]*notificationHistoryRow isUnread/);
  assert.doesNotMatch(center, /aria-pressed=/);
  assert.match(center, /notificationHistorySrOnly/);
  assert.match(center, /\{structure\.newLabel\}/);
});

test('bell and dialog expose an explicit accessible control relationship', () => {
  assert.match(center, /NOTIFICATION_DIALOG_ID = 'veinvite-notification-history'/);
  assert.match(center, /aria-controls=\{open \? NOTIFICATION_DIALOG_ID : undefined\}/);
  assert.match(center, /id=\{NOTIFICATION_DIALOG_ID\}/);
});

test('reduced-motion users skip the delayed exit and CSS animation', () => {
  assert.match(center, /REDUCED_MOTION_QUERY = '\(prefers-reduced-motion: reduce\)'/);
  assert.match(center, /window\.matchMedia\(REDUCED_MOTION_QUERY\)\.matches/);
  assert.match(
    center,
    /@media\(prefers-reduced-motion:reduce\)\{\.notificationHistoryBackdrop,\.notificationHistoryPanel\{animation:none!important\}/,
  );
});

test('mobile motion rises from the bottom and keeps safe-area positioning', () => {
  assert.match(center, /--notification-history-enter-y:14px/);
  assert.match(center, /--notification-history-exit-y:8px/);
  assert.match(center, /transform-origin:bottom center/);
  assert.match(center, /env\(safe-area-inset-bottom\)/);
});

test('open notification history refreshes date groups without background minute rerenders', () => {
  assert.match(center, /const \[clockTick, setClockTick\] = useState\(0\)/);
  assert.match(center, /\[sorted, clockTick, open\]/);
  assert.match(
    center,
    /useEffect\(\(\) => \{\s*if \(!open\) return;\s*const timer = window\.setInterval/,
  );
});
