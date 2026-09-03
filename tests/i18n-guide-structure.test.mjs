import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  localeSource,
  guideSource,
  leaderboardSource,
  leaderboardCopySource,
  providerSource,
  hardeningSource,
] = await Promise.all([
  readFile('src/lib/i18n/locales.ts', 'utf8'),
  readFile('src/components/AppGuide.tsx', 'utf8'),
  readFile('src/components/PublicLeaderboard.tsx', 'utf8'),
  readFile('src/lib/i18n/leaderboardCopy.ts', 'utf8'),
  readFile('src/components/AppProviders.tsx', 'utf8'),
  readFile('src/lib/i18n/guideCopyFinalHardening.ts', 'utf8'),
]);

const supportedLocales = [
  ...localeSource.matchAll(/\{ locale: '([^']+)'/g),
].map((match) => match[1]);

test('final Guide copy covers every supported locale', () => {
  assert.equal(supportedLocales.length, 27);

  for (const locale of supportedLocales) {
    const key = locale.includes('-') ? `'${locale}'` : locale;
    assert.match(
      hardeningSource,
      new RegExp(`\\n  ${key.replace('-', '\\-')}: \\{`),
      `missing final Guide copy for ${locale}`,
    );
  }
});

test('Guide keeps participation eligibility while public counting guidance lives with leaderboard impact', () => {
  assert.match(guideSource, /<section className="eligibilityCard">/);
  assert.doesNotMatch(guideSource, /<section className="countCard">/);
  assert.doesNotMatch(guideSource, /flow\.countDescription/);
  assert.match(leaderboardSource, /<p className="impactNote">\{t\.impactNote\}<\/p>/);
  assert.match(leaderboardCopySource, /impactTitle:\s*'VeInvite를 통해 유입된 사용자'/);
  assert.match(leaderboardCopySource, /모든 미션을 완료하고 검증을 통과한 지갑만 집계해요/);
});

test('Korean Guide explains 3+ dApps and reusable slots precisely', () => {
  assert.match(hardeningSource, /초대는 어떻게 진행되나요\?/);
  assert.match(hardeningSource, /초대 링크 공유/);
  assert.match(hardeningSource, /3개 이상에서 각각 B3TR 보상을 받고/);
  assert.match(hardeningSource, /완료된 친구의 슬롯은 다시 열려/);
});

test('Guide hardening runs only after expanded locales are registered', () => {
  const registrationIndex = providerSource.indexOf(
    "@/lib/i18n/localePacks/registerExpandedLocales",
  );
  const guideHardeningIndex = providerSource.indexOf(
    "@/lib/i18n/guideCopyFinalHardening",
  );

  assert.ok(registrationIndex >= 0);
  assert.ok(guideHardeningIndex > registrationIndex);
});
