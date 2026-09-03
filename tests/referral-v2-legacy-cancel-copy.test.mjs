import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [hardening, home] = await Promise.all([
  readFile(new URL('../src/lib/i18n/referralLinkCopyFinalHardening.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/HomeClient.tsx', import.meta.url), 'utf8'),
]);

const successStart = hardening.indexOf('const LEGACY_CANCEL_SUCCESS');
const successEnd = hardening.indexOf('\n};', successStart);
const successBlock = hardening.slice(successStart, successEnd + 3);

const expectedLocales = [
  'en','ko','zh','hi','es','ja','it','tr','nl','de','fr','ar','bn','pt','ru','id','vi','zh-tw','sv','ro','ur','pcm','arz','mr','te','sw','ha',
];

test('legacy cancellation success feedback is localized for all supported locales', () => {
  assert.ok(successStart >= 0, 'missing LEGACY_CANCEL_SUCCESS map');
  assert.ok(successEnd > successStart, 'incomplete LEGACY_CANCEL_SUCCESS map');

  for (const locale of expectedLocales) {
    const pattern = locale === 'zh-tw'
      ? /'zh-tw':\s*'/i
      : new RegExp(`\\n\\s*${locale}:\\s*'`, 'i');
    assert.match(successBlock, pattern, `missing legacy-cancel success copy for ${locale}`);
  }

  assert.match(
    hardening,
    /HOME_COPY\[locale\]\.cancelled\s*=\s*LEGACY_CANCEL_SUCCESS\[locale\]/i,
  );
});

test('legacy cancellation success reflects permanent-link semantics', () => {
  assert.match(successBlock, /Old invite link cancelled/i);
  assert.match(successBlock, /permanent invite link is unchanged/i);
  assert.match(successBlock, /friend slot is available again/i);
  assert.match(successBlock, /기존 1회용 초대 링크를 취소했어요/i);
  assert.match(successBlock, /영구 초대 링크는 그대로이며/i);
  assert.match(successBlock, /친구 슬롯을 다시 사용할 수 있어요/i);

  assert.doesNotMatch(successBlock, /create a new one/i);
  assert.doesNotMatch(successBlock, /새 초대를 만들 수 있어요/i);
});

test('Home uses the hardened cancellation success key after the legacy cancel succeeds', () => {
  assert.match(
    home,
    /closeCancelModal\(\);[\s\S]*showFeedback\('success',\s*t\.cancelled\);[\s\S]*await load\(\)/i,
  );
});
