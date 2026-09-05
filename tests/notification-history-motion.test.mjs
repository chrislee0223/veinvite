import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const providers = read('src/components/AppProviders.tsx');
const motion = read('src/components/NotificationHistoryMotionStyles.tsx');

test('notification history opens with subtle backdrop and panel motion', () => {
  assert.match(
    providers,
    /<NotificationHistoryMotionStyles\s*\/>/,
  );
  assert.match(motion, /notificationHistoryBackdropIn/);
  assert.match(motion, /notificationHistoryPanelIn/);
  assert.match(
    motion,
    /\.notificationHistoryBackdrop[\s\S]*animation:\s*notificationHistoryBackdropIn\s+180ms/,
  );
  assert.match(
    motion,
    /\.notificationHistoryPanel[\s\S]*animation:\s*notificationHistoryPanelIn\s+210ms/,
  );
  assert.match(motion, /scale\(\.985\)/);
});

test('notification history motion respects mobile direction and reduced motion', () => {
  assert.match(
    motion,
    /@media \(max-width:\s*560px\)[\s\S]*--notification-history-enter-y:\s*14px/,
  );
  assert.match(
    motion,
    /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none\s*!important/,
  );
});
