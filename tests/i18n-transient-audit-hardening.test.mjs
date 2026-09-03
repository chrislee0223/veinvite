import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  snackbar,
  focusGuard,
  providers,
  finalUi,
  transientCopy,
] = await Promise.all([
  read('src/components/TransientSnackbar.tsx'),
  read('src/components/NotificationDialogFocusGuard.tsx'),
  read('src/components/AppProviders.tsx'),
  read('src/app/final-ui-hardening.css'),
  read('src/lib/i18n/transientCopyHardening.ts'),
]);

test('backend and infrastructure errors are sanitized before transient feedback reaches users', () => {
  assert.match(snackbar, /safeErrorText/);
  assert.match(snackbar, /BACKEND_ERROR_PATTERNS/);
  assert.match(snackbar, /Only one active invitation is allowed/);
  assert.match(snackbar, /Wallet verification is required/);
  assert.match(snackbar, /Too many requests/);
  assert.match(snackbar, /JWT issued at future/);
  assert.match(snackbar, /permission denied/);
  assert.match(snackbar, /HOME_COPY\[currentLocale\(\)\]/);
  assert.match(snackbar, /copy\.cancelError/);
  assert.match(snackbar, /copy\.createError/);
  assert.match(snackbar, /copy\.loadError/);
  assert.match(snackbar, /copy\.genericError/);
  assert.match(snackbar, /feedback\.kind === 'error'[\s\S]*safeErrorText\(feedback\.text\)/);
});

test('notification aria-modal dialogs keep keyboard focus inside and restore the opener', () => {
  assert.match(focusGuard, /aria-modal=\\"true\\"/);
  assert.match(focusGuard, /event\.key !== 'Tab'/);
  assert.match(focusGuard, /event\.shiftKey/);
  assert.match(focusGuard, /activeDialog\.contains/);
  assert.match(focusGuard, /previousFocus/);
  assert.match(focusGuard, /restoreTarget\.focus\(\)/);
  assert.match(focusGuard, /MutationObserver/);
  assert.match(providers, /<NotificationDialogFocusGuard \/>/);
});

test('confirmation dialogs remain reachable on short translated viewports', () => {
  assert.match(finalUi, /\.modalBackdrop \.modalCard/);
  assert.match(finalUi, /\.settingsPage \.confirmationModal/);
  assert.match(finalUi, /max-height:calc\(100dvh - 40px\)/);
  assert.match(finalUi, /overflow-y:auto/);
  assert.match(finalUi, /overscroll-behavior:contain/);
});

test('reviewed expanded-locale transient wording remains protected', () => {
  assert.match(providers, /transientCopyHardening/);

  assert.match(transientCopy, /NOTIFICATION_COPY\.mr/);
  assert.match(transientCopy, /VOT3 रूपांतरण पूर्ण!/);
  assert.match(transientCopy, /ही सूचना वाचलेली म्हणून नोंदवता आली नाही/);

  assert.match(transientCopy, /NOTIFICATION_COPY\.te/);
  assert.match(transientCopy, /VOT3 మార్పిడి పూర్తయింది!/);
  assert.match(transientCopy, /చదివినట్లు గుర్తించలేకపోయాం/);

  assert.match(transientCopy, /NOTIFICATION_COPY\.ha/);
  assert.match(transientCopy, /Buɗe sanarwa/);
  assert.match(transientCopy, /matsayin ladan ka/);

  assert.match(transientCopy, /Ubadilishaji kwenda VOT3 umekamilika!/);
  assert.match(transientCopy, /Stäng avisering/);
  assert.match(transientCopy, /Închide notificarea/);
});
