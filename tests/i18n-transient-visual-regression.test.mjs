import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const locales = read('src/lib/i18n/locales.ts');
const preview = read('src/components/NotificationUiPreview.tsx');
const surface = read('src/components/InviteNotificationSurface.tsx');
const receipt = read('src/components/RewardReceiptNotice.tsx');
const typography = read('src/app/localized-typography.css');

test('VeInvite keeps the reviewed locale matrix in one registry', () => {
  const definitions = [...locales.matchAll(/\{ locale: '([^']+)'/g)].map((match) => match[1]);
  assert.ok(definitions.length >= 27, 'transient UI QA must not shrink below the reviewed locale baseline');
  assert.equal(new Set(definitions).size, definitions.length, 'locale registry must not contain duplicates');
  for (const required of ['vi', 'pcm', 'ha', 'ar', 'ur', 'arz', 'de', 'ru', 'zh-tw']) {
    assert.ok(definitions.includes(required), `high-risk locale ${required} must remain in the QA matrix`);
  }
});

test('notification preview uses the selected locale even for temporary error UI', () => {
  assert.match(preview, /NOTIFICATION_COPY\[locale\]\.acknowledgementError/);
  assert.doesNotMatch(preview, /테스트용 오류 메시지/);
});

test('transient surfaces stay fluid on narrow mobile screens', () => {
  assert.match(surface, /width:min\(100%,520px\)/);
  assert.match(surface, /@media \(max-width:560px\)/);
  assert.match(surface, /padding:0;/);
  assert.match(receipt, /width: min\(calc\(100vw - 28px\), 500px\)/);
  assert.match(receipt, /max-height: calc\(100dvh/);
  assert.match(receipt, /overflow: auto/);
  assert.match(receipt, /@media \(max-width: 420px\)/);
});

test('localized typography protects translated words and RTL transient UI', () => {
  assert.match(typography, /overflow-wrap:\s*normal\s*!important/);
  assert.match(typography, /word-break:\s*keep-all\s*!important/);
  assert.match(typography, /html:is\(\[lang='zh'\], \[lang='zh-tw'\], \[lang='ja'\]\)/);
  assert.match(typography, /html\[dir='rtl'\] \.notificationRoot \.closeButton/);
  assert.match(typography, /unicode-bidi:\s*isolate/);
  assert.doesNotMatch(surface, /word-break:\s*break-all/i);
  assert.doesNotMatch(receipt, /word-break:\s*break-all/i);
});
