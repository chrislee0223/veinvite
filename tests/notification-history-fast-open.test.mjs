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
  assert.match(openHandler, /const visibleLoading = !historyResolvedRef\.current/);
  assert.doesNotMatch(openHandler, /refresh\(false\)/);
});

test('startup notification reconciliation materializes lifecycle before publishing one authoritative history state', () => {
  const lifecycleStart = source.indexOf('const refreshLifecycle = useCallback');
  const lifecycleEnd = source.indexOf('const synchronizeNotifications = useCallback', lifecycleStart);
  const lifecycleBody = source.slice(lifecycleStart, lifecycleEnd);
  const syncStart = source.indexOf('const synchronizeNotifications = useCallback');
  const syncEnd = source.indexOf('const acknowledge = useCallback', syncStart);
  const syncBody = source.slice(syncStart, syncEnd);

  assert.match(lifecycleBody, /fetch\(\s*'\/api\/notifications'/);
  assert.doesNotMatch(lifecycleBody, /setLoading\(/);
  assert.match(syncBody, /await refreshLifecycle\(autoOpen\)/);
  assert.match(syncBody, /if \(!lifecycleApplied\) \{\s*await loadLatestHistory/);
  assert.match(source, /latestHistoryRequestRef/);
  assert.match(source, /lifecycleRefreshRef = useRef<Promise<boolean>/);
});
test('notification refresh effect is not keyed to history item count', () => {
  assert.doesNotMatch(
    source,
    /\[invalidateWalletSession,\s*items\.length,\s*loadHistoryPage,\s*wallet\]/,
  );
});

test('mark-all applies server-authoritative unread state before one coordinated background reconciliation', () => {
  const markAllStart = source.indexOf('const markAllRead = useCallback');
  const markAllEnd = source.indexOf('const loadMore = useCallback', markAllStart);
  assert.ok(markAllStart >= 0);
  assert.ok(markAllEnd > markAllStart);
  const markAllBody = source.slice(markAllStart, markAllEnd);

  assert.match(
    markAllBody,
    /const nextUnreadCount = acknowledgement\.unreadCount/,
  );
  assert.doesNotMatch(
    markAllBody,
    /unreadCount - unreadThroughSnapshot\.length/,
  );
  assert.match(markAllBody, /setUnreadCount\(nextUnreadCount\)/);

  const localUpdateIndex = markAllBody.indexOf('setUnreadCount(nextUnreadCount)');
  const reconcileIndex = markAllBody.indexOf('void synchronizeNotifications(false)');
  assert.ok(localUpdateIndex >= 0);
  assert.ok(reconcileIndex > localUpdateIndex);
  assert.doesNotMatch(markAllBody, /void loadLatestHistory/);
  assert.doesNotMatch(markAllBody, /void refreshLifecycle\(false\)/);
});


test('startup badge stays hidden until coordinated notification reconciliation settles', () => {
  assert.match(source, /const \[presentationReady, setPresentationReady\] = useState\(false\)/);
  assert.match(source, /void synchronizeNotifications\(true\)\.finally/);
  assert.match(source, /setPresentationReady\(true\)/);
  assert.match(source, /unreadCount=\{presentationReady \? unreadCount : 0\}/);
  assert.match(source, /presentationReady=\{presentationReady\}/);
});
