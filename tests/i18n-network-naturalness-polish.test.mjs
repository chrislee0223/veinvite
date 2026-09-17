import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [patchSource, networkSource] = await Promise.all([
  readFile('src/lib/i18n/networkNaturalnessPolish.ts', 'utf8'),
  readFile('src/components/AppNetwork.tsx', 'utf8'),
]);

const locales = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja', 'it', 'tr', 'nl', 'de', 'fr', 'ar', 'bn', 'pt',
  'ru', 'id', 'vi', 'zh-tw', 'sv', 'ro', 'ur', 'pcm', 'arz', 'mr', 'te', 'sw', 'ha', 'el', 'cs',
];

test('single Network runtime consumes the canonical localized Network copy', () => {
  assert.match(networkSource, /NETWORK_EXPERIENCE_COPY/);
  assert.match(networkSource, /NETWORK_CANVAS_CONTROL_COPY/);
  assert.doesNotMatch(networkSource, /AppNetworkCanaryV\d+/);
});

test('all supported locales receive semantic, count and user-facing terminology corrections', () => {
  for (const locale of locales) {
    const marker = locale === 'zh-tw' ? "  'zh-tw': {" : `  ${locale}: {`;
    assert.ok(patchSource.includes(marker), `missing naturalness patch for ${locale}`);
  }

  for (const key of ['savedCount', 'peopleCount', 'groupsCount', 'zeroAllowed', 'dragUngroup', 'newNodeAdded']) {
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

test('Korean Network copy removes literal and developer-facing phrasing', () => {
  for (const expected of [
    "savedCount: '이 그룹 인원 {count}명'",
    "releaseAdd: '놓으면 추가'",
    "emptyReady: '비어 있음 · 사람을 놓을 수 있어요'",
    "optional: '사람을 선택하지 않아도 돼요'",
    "save: '변경사항 저장'",
    "branch: '분기'",
    "directNetwork: '직접 초대 네트워크'",
    "invitedBy: '초대한 사람'",
    "hintView: '사람을 길게 눌러 편집 · 화면을 끌어 이동 · 두 손가락으로 확대/축소'",
    "newNodeAdded: '새 친구가 추가됐어요'",
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

test('technical node-added feedback becomes friend-facing in every locale', () => {
  assert.equal((patchSource.match(/newNodeAdded:/g) ?? []).length, locales.length);
  for (const expected of [
    "newNodeAdded: 'New friend added'",
    "newNodeAdded: '새 친구가 추가됐어요'",
    "newNodeAdded: '已添加新朋友'",
    "newNodeAdded: '新しい友だちを追加しました'",
    "newNodeAdded: 'Προστέθηκε νέος φίλος'",
  ]) {
    assert.ok(patchSource.includes(expected), `missing friend-facing feedback: ${expected}`);
  }
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
