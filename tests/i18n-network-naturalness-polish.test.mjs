import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [patchSource, v70Source] = await Promise.all([
  readFile('src/lib/i18n/networkNaturalnessPolish.ts', 'utf8'),
  readFile('src/components/AppNetworkCanaryV70.tsx', 'utf8'),
]);

const locales = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja', 'it', 'tr', 'nl', 'de', 'fr', 'ar', 'bn', 'pt',
  'ru', 'id', 'vi', 'zh-tw', 'sv', 'ro', 'ur', 'pcm', 'arz', 'mr', 'te', 'sw', 'ha', 'el',
];

test('V70 loads the Network naturalness pass before rendering localized UI', () => {
  assert.match(v70Source, /import '@\/lib\/i18n\/networkNaturalnessPolish';/);
});

test('all supported locales receive semantic and number-safe copy corrections', () => {
  for (const locale of locales) {
    const marker = locale === 'zh-tw' ? "  'zh-tw': {" : `  ${locale}: {`;
    assert.ok(patchSource.includes(marker), `missing naturalness patch for ${locale}`);
  }

  for (const key of ['savedCount', 'peopleCount', 'groupsCount', 'zeroAllowed', 'dragUngroup']) {
    assert.equal(
      (patchSource.match(new RegExp(`${key}:`, 'g')) ?? []).length,
      locales.length,
      `${key} must be intentionally reviewed in every locale`,
    );
  }
});

test('count copy avoids singular/plural grammar traps in inflected languages', () => {
  for (const expected of [
    "peopleCount: 'People: {count}'",
    "peopleCount: 'Personas: {count}'",
    "peopleCount: 'Personnes : {count}'",
    "peopleCount: 'Personen: {count}'",
    "peopleCount: 'Участники: {count}'",
    "peopleCount: 'Άτομα: {count}'",
    "groupsCount: 'Groups: {count}'",
    "groupsCount: 'Grupos: {count}'",
  ]) {
    assert.ok(patchSource.includes(expected), `missing number-safe count copy: ${expected}`);
  }
  assert.doesNotMatch(patchSource, /savedCount:\s*'\{count\} people/);
});

test('Korean Network copy removes literal UI phrasing and branch jargon', () => {
  for (const expected of [
    "savedCount: '이 그룹 인원 {count}명'",
    "releaseAdd: '놓으면 추가'",
    "optional: '사람을 선택하지 않아도 돼요'",
    "save: '변경사항 저장'",
    "branch: '분기'",
    "directNetwork: '직접 초대 네트워크'",
    "invitedBy: '초대한 사람'",
    "confirmMoveError: '그룹 이동이 완료됐는지 확인하지 못했어요.'",
  ]) {
    assert.ok(patchSource.includes(expected), `missing Korean polish: ${expected}`);
  }
  assert.doesNotMatch(patchSource, /branch:\s*'브랜치'/);
});

test('Traditional Chinese Network terminology consistently uses Taiwan-standard 網路', () => {
  for (const expected of [
    "title: '我的網路'",
    "directNetwork: '直接網路'",
    "navLabel: '網路'",
    "verifiedAdding: '已驗證 · 正在加入此網路'",
  ]) {
    assert.ok(patchSource.includes(expected), `missing zh-tw polish: ${expected}`);
  }
  assert.doesNotMatch(patchSource, /網絡/);
});

test('known semantic mistranslations are explicitly corrected', () => {
  assert.match(patchSource, /vi:[\s\S]*?savedCount:\s*'Số người trong nhóm: \{count\}'/);
  assert.match(patchSource, /mr:[\s\S]*?collapsed:\s*'आकुंचित'/);
  assert.match(patchSource, /sv:[\s\S]*?dragUngroup:\s*'Släpp här för att ta bort från gruppen'/);
  assert.match(patchSource, /el:[\s\S]*?joining:\s*'Μπαίνει στο δίκτυο'/);
  assert.match(patchSource, /tr:[\s\S]*?available:\s*'Davet edilebilir'/);
  assert.match(patchSource, /it:[\s\S]*?maintenance:\s*'La rete non è al momento disponibile\.'/);
  assert.match(patchSource, /hi:[\s\S]*?invitedBy:\s*'आमंत्रणकर्ता'/);
});

test('naturalness polish stays copy-only and cannot take ownership of Network behavior', () => {
  for (const forbidden of [
    'localStorage',
    'sessionStorage',
    "setProperty('--x'",
    "setProperty('--y'",
    "setProperty('--gx'",
    "setProperty('--gy'",
    '--cameraX',
    '--cameraY',
    '--networkZoom',
    'pointerdown',
    'pointermove',
    'pointerup',
    'fetch(',
    '/api/',
  ]) {
    assert.ok(!patchSource.includes(forbidden), `copy polish must not own behavior: ${forbidden}`);
  }
});
