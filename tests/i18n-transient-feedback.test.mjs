import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const locales = read('src/lib/i18n/locales.ts');
const home = read('src/components/HomeClient.tsx');
const snackbar = read('src/components/TransientSnackbar.tsx');
const homeCopy = read('src/lib/i18n/homeCopy.ts');
const notificationCopy = read('src/lib/i18n/notificationCopy.ts');

const localeDefinitions = [...locales.matchAll(/\{ locale: '([^']+)'/g)].map((match) => match[1]);

test('home transient feedback stays compatible with every supported locale', () => {
  assert.ok(localeDefinitions.length >= 27);
  assert.equal(new Set(localeDefinitions).size, localeDefinitions.length);
  assert.match(homeCopy, /export const HOME_COPY:\s*Record<Locale, HomeCopy>/);
  assert.match(notificationCopy, /export const NOTIFICATION_COPY:\s*Record<Locale, NotificationCopy>/);
  assert.match(home, /NOTIFICATION_COPY\[locale\]\.closeAria/);
  assert.match(home, /showFeedback\('success', t\.cancelled\)/);
  assert.match(home, /showFeedback\('success', t\.copied\)/);
});

test('legacy layout-shifting home toast is removed', () => {
  assert.doesNotMatch(home, /const \[message, setMessage\]/);
  assert.doesNotMatch(home, /className="toast"/);
  assert.doesNotMatch(home, /\.toast\s*\{/);
  assert.match(home, /<TransientSnackbar/);
});

test('success feedback auto-dismisses but errors remain until an explicit action', () => {
  assert.match(snackbar, /const AUTO_DISMISS_MS = 4_000/);
  assert.match(snackbar, /feedback\.kind === 'error'/);
  assert.match(snackbar, /window\.setTimeout\(onDismiss, AUTO_DISMISS_MS\)/);
  assert.match(snackbar, /visibilitychange/);
  assert.match(snackbar, /onClick=\{onDismiss\}/);
  assert.match(snackbar, /role=\{feedback\.kind === 'error' \? 'alert' : 'status'\}/);
});

test('snackbar never changes document flow and stays clear of bottom navigation', () => {
  assert.match(snackbar, /position:\s*fixed/);
  assert.match(snackbar, /bottom:\s*calc\(92px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(snackbar, /width:\s*min\(calc\(100vw - 28px\), 520px\)/);
  assert.match(snackbar, /z-index:\s*92/);
  assert.match(snackbar, /width:\s*44px/);
  assert.match(snackbar, /height:\s*44px/);
});

test('feedback is dismissed on meaningful navigation and referral v2 actions', () => {
  assert.match(home, /const changeTab = \(nextTab: AppTab\) => \{\s*clearFeedback\(\)/s);
  assert.match(home, /const copyUrl = async \([\s\S]*?\) => \{[\s\S]*?clearFeedback\(\)/);
  assert.match(home, /const shareUrl = async \([\s\S]*?\) => \{[\s\S]*?clearFeedback\(\)/);
  assert.match(home, /const cancelLegacyInvite = async \(\) => \{[\s\S]*?clearFeedback\(\)/);
  assert.doesNotMatch(home, /const createInvite = async \(\)/);
});

test('transient feedback respects reduced-motion and translated wrapping', () => {
  assert.match(snackbar, /prefers-reduced-motion:\s*reduce/);
  assert.match(snackbar, /word-break:\s*keep-all/);
  assert.match(snackbar, /overflow-wrap:\s*break-word/);
  assert.doesNotMatch(snackbar, /word-break:\s*break-all/);
});