import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const files = [
  'src/lib/i18n/rewardXPromotionCopy.ts',
  'src/lib/i18n/rewardXPromotionExpandedCopyA.ts',
  'src/lib/i18n/rewardXPromotionExpandedCopyB.ts',
];

test('all 29 locales describe posting within 24 hours, never submitting an X link', () => {
  let count = 0;
  for (const path of files) {
    const source = readFileSync(path, 'utf8');
    const labels = [...source.matchAll(/^\s*expiredBody: '(?:\\'|[^'])*',?\s*$/gm)];
    assert.ok(labels.length > 0, `No expiry translations in ${path}`);
    for (const [label] of labels) {
      count += 1;
      assert.match(label, /24|२४|২৪/, `Missing 24-hour publication deadline: ${path}`);
      assert.doesNotMatch(
        label,
        /submission|submit|제출|提交|Einreichungsfenster|in te dienen|kuwasilisha/i,
        `Retired manual-submit wording leaked: ${path}`,
      );
    }
  }
  assert.equal(count, 29);
});

test('Korean and English expiry copy describes publishing, not a manual URL submission', () => {
  const source = readFileSync(files[0], 'utf8');
  assert.match(source, /expiredBody: 'The 24-hour window to publish your X post has ended\.'/);
  assert.match(source, /expiredBody: 'X 게시물을 올릴 수 있는 24시간 기한이 지났어요\.'/);
  assert.doesNotMatch(source, /expiredBody: 'X 프로모션 게시물 제출/);
});
