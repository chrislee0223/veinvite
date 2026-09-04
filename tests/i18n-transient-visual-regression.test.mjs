import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const locales = read('src/lib/i18n/locales.ts');
const historyCopy = read('src/lib/i18n/notificationHistoryCopy.ts');
const preview = read('src/components/NotificationUiPreview.tsx');
const developerPreview = read('src/components/DeveloperPreview.tsx');
const surface = read('src/components/InviteNotificationSurface.tsx');
const receipt = read('src/components/RewardReceiptNotice.tsx');
const typography = read('src/app/localized-typography.css');

test('VeInvite keeps the reviewed 27-locale matrix in one registry', () => {
  const definitions = [...locales.matchAll(/\{ locale: '([^']+)'/g)].map((match) => match[1]);
  assert.equal(definitions.length, 27, 'transient UI QA must cover all 27 supported locales');
  assert.equal(new Set(definitions).size, 27, 'locale registry must not contain duplicates');
  for (const required of ['vi', 'pcm', 'ha', 'ar', 'ur', 'arz', 'de', 'ru', 'zh-tw']) {
    assert.ok(definitions.includes(required), `high-risk locale ${required} must remain in the QA matrix`);
  }
});

test('notification history preview localizes loading, empty and temporary error UI from the selected locale', () => {
  assert.match(preview, /NOTIFICATION_HISTORY_COPY\[locale\]/);
  assert.match(preview, /structure\.loadingTitle/);
  assert.match(preview, /structure\.loadingBody/);
  assert.match(preview, /structure\.emptyTitle/);
  assert.match(preview, /structure\.emptyBody/);
  assert.match(preview, /structure\.errorTitle/);
  assert.match(preview, /structure\.errorBody/);
  assert.match(preview, /structure\.retry/);
  assert.match(historyCopy, /errorTitle:/);
  assert.match(historyCopy, /errorBody:/);
  assert.doesNotMatch(preview, /테스트용 오류 메시지/);
  assert.doesNotMatch(preview, /Notification request failed\./);
});

test('notification history preview protects RTL direction and mobile safe areas', () => {
  assert.match(preview, /isRtlLocale\(locale\)/);
  assert.match(preview, /dir=\{rtl \? 'rtl' : 'ltr'\}/);
  assert.match(preview, /inset-inline-end:/);
  assert.match(preview, /padding-inline-start:/);
  assert.match(preview, /env\(safe-area-inset-bottom\)/);
  assert.match(preview, /prefers-reduced-motion:reduce/);
});

test('developer live-app preview blocks pointer and keyboard interaction', () => {
  assert.match(
    developerPreview,
    /className="livePreviewFrame"[\s\S]*?inert/,
  );
  assert.match(developerPreview, /클릭·키보드 조작은 잠겨 있습니다/);
  assert.match(developerPreview, /className="interactionLock"/);
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
