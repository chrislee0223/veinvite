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
  assert.match(center, /setTimeout\(\s*finishClose,\s*NOTIFICATION_CLOSE_MS/);
});

test('closing keeps focus and scroll ownership until the exit motion completes', () => {
  assert.match(center, /const finishClose = useCallback/);
  assert.match(center, /onClose\(\);[\s\S]*restoreBellFocus\(\);/);
  assert.match(center, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(center, /if \(!open \|\| closing\) return/);
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
