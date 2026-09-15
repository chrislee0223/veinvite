import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile('src/lib/i18n/networkNaturalnessPolish.ts', 'utf8');

const locales = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja', 'it', 'tr', 'nl', 'de', 'fr', 'ar', 'bn', 'pt',
  'ru', 'id', 'vi', 'zh-tw', 'sv', 'ro', 'ur', 'pcm', 'arz', 'mr', 'te', 'sw', 'ha', 'el', 'cs',
];

const start = source.indexOf('const NETWORK_USER_FACING_CANARY_POLISH');
const end = source.indexOf('\nfor (const [locale, patch] of Object.entries(NETWORK_USER_FACING_CANARY_POLISH)', start);
assert.ok(start >= 0 && end > start, 'final user-facing polish block must exist');
const polish = source.slice(start, end);

test('all 29 locales receive the final user-facing Network terminology review', () => {
  for (const locale of locales) {
    const marker = locale === 'zh-tw' ? "  'zh-tw': {" : `  ${locale}: {`;
    assert.ok(polish.includes(marker), `missing final user-facing polish for ${locale}`);
  }

  for (const key of ['hintView', 'allCanvas', 'available', 'removed']) {
    assert.equal(
      (polish.match(new RegExp(`${key}:`, 'g')) ?? []).length,
      locales.length,
      `${key} must be intentionally reviewed in every locale`,
    );
  }
});

test('visible gesture help describes people and the screen instead of implementation nodes and canvases', () => {
  const hintLines = polish.split('\n').filter((line) => line.includes('hintView:'));
  assert.equal(hintLines.length, locales.length);

  const developerTerms = /\bnode\b|\bcanvas\b|노드|캔버스|节点|節點|ノード|\bnodo\b|nœud|\bnó\b|узел|kanvas|nút mạng|\bnod\b|نوڈ|नोड|कॅनव्हास|nodi|κόμβ/i;
  for (const line of hintLines) {
    assert.doesNotMatch(line, developerTerms, `developer-facing gesture terminology remains: ${line.trim()}`);
  }
});

test('invite-slot and group-removal states state their actual meaning', () => {
  for (const expected of [
    "available: 'Invite available'",
    "removed: 'Group deleted'",
    "available: '초대 가능'",
    "removed: '그룹 삭제됨'",
    "available: 'Invitación disponible'",
    "removed: 'Grupo eliminado'",
    "available: '可邀請'",
    "removed: '群組已刪除'",
  ]) {
    assert.ok(polish.includes(expected), `missing explicit state copy: ${expected}`);
  }
});

test('Korean Network wording uses one conversational tone and clearer search copy', () => {
  for (const expected of [
    "noSearchResults: '내 네트워크에 일치하는 지갑이 없어요.'",
    "noMatching: '조건에 맞는 직접 초대 분기가 없어요.'",
    "publicEnabledNote: '내 지갑 주소를 아는 사람이 공개 네트워크를 볼 수 있게 해요.'",
    "discoverableNote: '내 네트워크가 둘러보기 목록에 표시되게 해요.'",
    "noPublicNetworks: '아직 둘러볼 수 있는 공개 네트워크가 없어요.'",
    "visibilityError: '공개 네트워크 설정을 변경하지 못했어요.'",
    "networkPrivate: '이 네트워크는 비공개예요.'",
    "maintenance: '네트워크를 잠시 사용할 수 없어요.'",
  ]) {
    assert.ok(source.includes(expected), `missing Korean tone polish: ${expected}`);
  }
});

test('final terminology pass remains copy-only', () => {
  for (const forbidden of [
    'localStorage',
    'sessionStorage',
    "setProperty('--x'",
    "setProperty('--y'",
    '--cameraX',
    '--cameraY',
    '--networkZoom',
    'pointerdown',
    'pointermove',
    'pointerup',
    'fetch(',
    '/api/',
  ]) {
    assert.ok(!polish.includes(forbidden), `final copy polish must not own behavior: ${forbidden}`);
  }
});
