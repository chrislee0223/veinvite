import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [providerSource, polishSource] = await Promise.all([
  readFile('src/components/AppProviders.tsx', 'utf8'),
  readFile('src/lib/i18n/guideNaturalnessPolish.ts', 'utf8'),
]);

test('guide naturalness polish runs after final policy copy', () => {
  const finalGuideIndex = providerSource.indexOf(
    "@/lib/i18n/guideCopyFinalHardening",
  );
  const naturalnessIndex = providerSource.indexOf(
    "@/lib/i18n/guideNaturalnessPolish",
  );
  const vot3Index = providerSource.indexOf(
    "@/lib/i18n/guideVot3PolicyPolish",
  );

  assert.ok(finalGuideIndex >= 0);
  assert.ok(naturalnessIndex > finalGuideIndex);
  assert.ok(vot3Index > naturalnessIndex);
});

test('reviewed guide copy avoids literal completed-friend slot wording', () => {
  assert.doesNotMatch(polishSource, /completed friend(?:'s)? slot/i);
  assert.doesNotMatch(polishSource, /amico completato/u);
  assert.doesNotMatch(polishSource, /amigo concluído/u);
  assert.doesNotMatch(polishSource, /Freund-Plätze/u);
  assert.doesNotMatch(polishSource, /suất bạn bè/u);
  assert.doesNotMatch(polishSource, /prietenului finalizat/u);
});

test('German leaderboard uses a compact natural reward header', () => {
  assert.match(polishSource, /LEADERBOARD_COPY\.de\.earned = 'Belohnungen'/u);
  assert.doesNotMatch(polishSource, /LEADERBOARD_COPY\.de\.earned = 'Gesamtbelohnungen'/u);
});
