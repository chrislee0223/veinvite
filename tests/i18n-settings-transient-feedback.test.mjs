import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const settings = readFileSync('src/components/AppSettings.tsx', 'utf8');
const snackbar = readFileSync('src/components/TransientSnackbar.tsx', 'utf8');
const notificationCopy = readFileSync('src/lib/i18n/notificationCopy.ts', 'utf8');

test('wallet settings errors use the shared fixed snackbar instead of shifting the settings card', () => {
  assert.match(settings, /import \{[\s\S]*TransientSnackbar[\s\S]*\} from '\.\/TransientSnackbar'/);
  assert.match(settings, /showWalletError\(t\.actionError\)/);
  assert.match(settings, /<TransientSnackbar/);
  assert.doesNotMatch(settings, /className="errorMessage"/);
  assert.doesNotMatch(settings, /\.errorMessage\s*\{/);
  assert.doesNotMatch(settings, /const \[error, setError\]/);
});

test('settings snackbar keeps localized close controls and persistent error behavior', () => {
  assert.match(settings, /NOTIFICATION_COPY\[locale\]\.closeAria/);
  assert.match(notificationCopy, /export const NOTIFICATION_COPY:\s*Record<Locale, NotificationCopy>/);
  assert.match(snackbar, /feedback\.kind === 'error'/);
  assert.match(snackbar, /onClick=\{onDismiss\}/);
});

test('starting another meaningful settings action clears stale transient errors', () => {
  assert.match(settings, /const runWalletAction = async[\s\S]*?clearFeedback\(\)/);
  assert.match(settings, /const openWalletConfirmation =[\s\S]*?clearFeedback\(\)/);
  assert.match(settings, /onClick=\{\(\) => \{\s*clearFeedback\(\);\s*onConnect\(\)/s);

  const openLanguagePickerStart = settings.indexOf(
    'const openLanguagePicker = useCallback(() => {',
  );
  const openLanguagePickerEnd = settings.indexOf(
    '}, [clearFeedback, clearLanguageCloseFallback]);',
    openLanguagePickerStart,
  );
  assert.ok(openLanguagePickerStart >= 0);
  assert.ok(openLanguagePickerEnd > openLanguagePickerStart);

  const openLanguagePickerBody = settings.slice(
    openLanguagePickerStart,
    openLanguagePickerEnd,
  );
  const clearIndex = openLanguagePickerBody.indexOf('clearFeedback();');
  const openIndex = openLanguagePickerBody.indexOf('setLanguageOpen(true);');
  assert.ok(clearIndex >= 0);
  assert.ok(openIndex > clearIndex);
  assert.match(settings, /onClick=\{openLanguagePicker\}/);
});
