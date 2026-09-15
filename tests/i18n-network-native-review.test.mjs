import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [reviewSource, guideSource] = await Promise.all([
  readFile('src/lib/i18n/networkNativeReview.ts', 'utf8'),
  readFile('src/components/AppGuide.tsx', 'utf8'),
]);

const locales = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja', 'it', 'tr', 'nl', 'de', 'fr', 'ar', 'bn', 'pt',
  'ru', 'id', 'vi', 'zh-tw', 'sv', 'ro', 'ur', 'pcm', 'arz', 'mr', 'te', 'sw', 'ha', 'el',
];

test('final Network language review is loaded for normal and canary Network routes', () => {
  assert.match(reviewSource, /^import '\.\/networkNaturalnessPolish';/);
  assert.match(guideSource, /import '@\/lib\/i18n\/networkNativeReview';/);
});

test('all 28 supported locales receive a deliberate final review', () => {
  for (const locale of locales) {
    const marker = locale === 'zh-tw' ? "  'zh-tw': {" : `  ${locale}: {`;
    assert.ok(reviewSource.includes(marker), `missing native-review patch for ${locale}`);
  }

  for (const key of [
    'hintView',
    'exploreDescription',
    'discoverable',
    'discoverableNote',
    'privateBranchesHidden',
    'maintenanceTitle',
    'maintenanceDescription',
    'visibilityLoading',
    'visibilityUnknown',
    'publicConfirm',
  ]) {
    assert.equal(
      (reviewSource.match(new RegExp(`${key}:`, 'g')) ?? []).length,
      locales.length,
      `${key} must be reviewed in every supported locale`,
    );
  }
});

test('Korean user-facing Network wording avoids developer-facing branch terminology', () => {
  for (const expected of [
    "branch: '연결'",
    "expandBranch: '연결 펼치기'",
    "collapseBranch: '연결 접기'",
    "noMatching: '일치하는 직접 초대 연결이 없어요.'",
    "privateBranchesHidden: '비공개 연결은 표시되지 않아요'",
  ]) {
    assert.ok(reviewSource.includes(expected), `missing Korean native review: ${expected}`);
  }
  const koBlock = reviewSource.match(/  ko: \{[\s\S]*?\n  \},\n  zh:/)?.[0] ?? '';
  assert.doesNotMatch(koBlock, /브랜치|캔버스|Explore/);
});

test('high-risk locales no longer expose raw English Network rollout copy', () => {
  const blocks = {
    hi: reviewSource.match(/  hi: \{[\s\S]*?\n  \},\n  es:/)?.[0] ?? '',
    ur: reviewSource.match(/  ur: \{[\s\S]*?\n  \},\n  pcm:/)?.[0] ?? '',
    pcm: reviewSource.match(/  pcm: \{[\s\S]*?\n  \},\n  arz:/)?.[0] ?? '',
    ha: reviewSource.match(/  ha: \{[\s\S]*?\n  \},\n  el:/)?.[0] ?? '',
  };

  assert.doesNotMatch(blocks.hi, /Public Network|referral paths|interactive canvas/);
  assert.doesNotMatch(blocks.ur, /Public Network|referral paths|interactive canvas/);
  assert.doesNotMatch(blocks.ha, /Public Network|referral paths|interactive canvas|Mission, reward|security details/);
  assert.match(blocks.pcm, /Private connections no go show/);
});

test('Traditional Chinese final review keeps Taiwan-standard 網路 terminology', () => {
  const block = reviewSource.match(/  'zh-tw': \{[\s\S]*?\n  \},\n  sv:/)?.[0] ?? '';
  assert.match(block, /網路/);
  assert.doesNotMatch(block, /網絡/);
});

test('literal coming-soon headings are replaced with availability or readiness wording', () => {
  for (const expected of [
    "title: 'Your network will be available soon'",
    "title: 'Dein Netzwerk ist bald verfügbar'",
    "title: 'Votre réseau sera bientôt disponible'",
    "title: 'ستتوفر شبكتك قريبًا'",
    "title: 'আপনার নেটওয়ার্ক শিগগিরই উপলভ্য হবে'",
    "title: 'آپ کا نیٹ ورک جلد دستیاب ہوگا'",
    "title: 'Mtandao wako utapatikana hivi karibuni'",
    "title: 'Το δίκτυό σας θα είναι σύντομα διαθέσιμο'",
  ]) {
    assert.ok(reviewSource.includes(expected), `missing natural availability heading: ${expected}`);
  }
});

test('native-review layer stays presentation-only', () => {
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
    assert.ok(!reviewSource.includes(forbidden), `native review must not own behavior: ${forbidden}`);
  }
});
