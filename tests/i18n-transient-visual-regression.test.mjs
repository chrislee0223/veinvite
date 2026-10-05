import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const locales = read('src/lib/i18n/locales.ts');
const harness = read('src/qa/QaNotificationStateHarness.tsx');
const surface = read('src/components/InviteNotificationSurfaceV2.tsx');
const snackbar = read('src/components/TransientSnackbar.tsx');
const receiptCenter = read('src/components/UnifiedInviteNotificationHistoryCenter.tsx');
const receiptView = read('src/components/RewardReceiptView.tsx');
const typography = read('src/app/localized-typography.css');
const notificationHardening = read('src/app/notification-i18n-hardening.css');

test('VeInvite keeps the reviewed locale matrix in one registry', () => {
  const definitions = [...locales.matchAll(/\{ locale: '([^']+)'/g)].map((match) => match[1]);
  assert.ok(definitions.length >= 27, 'transient UI QA must not shrink below the reviewed locale baseline');
  assert.equal(new Set(definitions).size, definitions.length, 'locale registry must not contain duplicates');
  for (const required of ['vi', 'pcm', 'ha', 'ar', 'ur', 'arz', 'de', 'ru', 'zh-tw']) {
    assert.ok(definitions.includes(required), `high-risk locale ${required} must remain in the QA matrix`);
  }
});

test('notification preview uses production history and transient surfaces', () => {
  assert.doesNotMatch(harness, /<InviteNotificationSurfaceV2/);
  assert.match(harness, /<InviteNotificationHistoryCenter[\s\S]*locale=\{locale\}/);
  assert.match(harness, /<TransientSnackbar/);
  assert.match(harness, /NOTIFICATION_COPY\[locale\]/);
  assert.doesNotMatch(harness, /acknowledgementError/);
});

test('transient surfaces stay fluid on narrow mobile screens', () => {
  assert.match(surface, /width:min\(100%,520px\)/);
  assert.match(surface, /@media \(max-width:560px\)/);
  assert.match(surface, /padding:0;/);
  assert.match(snackbar, /width: min\(calc\(100vw - 28px\), 520px\)/);
  assert.match(snackbar, /@media \(max-width: 360px\)/);
  assert.match(receiptCenter, /\.notificationHistoryPanel\{[^}]*overflow:hidden/s);
  assert.match(receiptCenter, /@media\(max-width:560px\)/);
  assert.match(receiptCenter, /height:calc\(74dvh - env\(safe-area-inset-bottom\)\)/);
  assert.match(receiptView, /\.notificationReceiptView\{padding:16px 14px\}/);
});

test('localized typography protects translated words and RTL transient UI', () => {
  assert.match(typography, /overflow-wrap:\s*normal\s*!important/);
  assert.match(typography, /word-break:\s*keep-all\s*!important/);
  assert.match(typography, /html:is\(\[lang='zh'\], \[lang='zh-tw'\], \[lang='ja'\]\)/);
  assert.match(typography, /html\[dir='rtl'\] \.notificationRoot \.closeButton/);
  assert.match(typography, /unicode-bidi:\s*isolate/);
  assert.doesNotMatch(surface, /word-break:\s*break-all/i);
  assert.doesNotMatch(receiptCenter, /word-break:\s*break-all/i);
  assert.doesNotMatch(receiptView, /word-break:\s*break-all/i);
});

test('notification modal follows its own locale in embedded previews', () => {
  assert.match(notificationHardening, /\.notificationCard\[lang='ko'\]/);
  assert.match(notificationHardening, /\.notificationCard:is\([\s\S]*?\[lang='zh-tw'\]/);
  assert.match(notificationHardening, /\.notificationCard\[lang='ur'\]/);
  assert.match(notificationHardening, /\.confirmButton[\s\S]*?padding-block:\s*9px/);
});
