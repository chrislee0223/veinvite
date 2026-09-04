import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/components/InAppInviteNotifications.tsx', import.meta.url),
  'utf8',
);

test('opening the notification center does not wait for lifecycle materialization', () => {
  const openHandlerStart = source.indexOf('onOpen={() => {');
  assert.ok(openHandlerStart >= 0);
  const openHandler = source.slice(openHandlerStart, openHandlerStart + 1400);

  const setOpenIndex = openHandler.indexOf('setOpen(true)');
  const lifecycleIndex = openHandler.indexOf('void refreshLifecycle(false)');
  assert.ok(setOpenIndex >= 0);
  assert.ok(lifecycleIndex > setOpenIndex);
  assert.doesNotMatch(openHandler, /await\s+refreshLifecycle/);
});

test('first visible load reads persisted history directly', () => {
  const openHandlerStart = source.indexOf('onOpen={() => {');
  const openHandler = source.slice(openHandlerStart, openHandlerStart + 1400);

  assert.match(openHandler, /items\.length === 0/);
  assert.match(openHandler, /loadLatestHistory/);
  assert.match(openHandler, /visibleLoading: true/);
  assert.doesNotMatch(openHandler, /refresh\(false\)/);
});

test('background lifecycle refresh is separate from visible history loading', () => {
  const lifecycleStart = source.indexOf('const refreshLifecycle = useCallback');
  const lifecycleEnd = source.indexOf('const acknowledge = useCallback', lifecycleStart);
  const lifecycleBody = source.slice(lifecycleStart, lifecycleEnd);

  assert.match(lifecycleBody, /fetch\(\s*'\/api\/notifications'/);
  assert.doesNotMatch(lifecycleBody, /setLoading\(/);
  assert.match(source, /latestHistoryRequestRef/);
  assert.match(source, /lifecycleRefreshRef/);
});

test('notification refresh effect is not keyed to history item count', () => {
  assert.doesNotMatch(
    source,
    /\[invalidateWalletSession,\s*items\.length,\s*loadHistoryPage,\s*wallet\]/,
  );
});

test('mark-all updates unread state locally without a blocking full refresh', () => {
  assert.match(source, /current - unreadThroughSnapshot\.length/);
  assert.doesNotMatch(source, /await\s+refresh\(false\)/);
});
