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
  homeGuideInfoSource,
  leaderboardInfoSource,
] = await Promise.all([
  readFile('src/lib/i18n/locales.ts', 'utf8'),
  readFile('src/components/AppGuide.tsx', 'utf8'),
  readFile('src/components/PublicLeaderboard.tsx', 'utf8'),
  readFile('src/lib/i18n/leaderboardCopy.ts', 'utf8'),
  readFile('src/components/AppProviders.tsx', 'utf8'),
  readFile('src/lib/i18n/guideCopyFinalHardening.ts', 'utf8'),
  readFile('src/components/HomeGuideInfoPortal.tsx', 'utf8'),
  readFile('src/components/LeaderboardImpactInfoPortal.tsx', 'utf8'),
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
  assert.match(guideSource, /<section className="guideCard eligibilityCard">/);
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

test('Home Guide uses one shared card language for invitation steps and eligibility', () => {
  assert.match(guideSource, /<section className="guideCard stepsCard">/u);
  assert.match(guideSource, /<h2>\{t\.title\}<\/h2>/u);
  assert.match(guideSource, /<section className="guideCard eligibilityCard">/u);
  assert.doesNotMatch(guideSource, /<header>/u);
  assert.match(
    guideSource,
    /<span className="stepNumber" aria-hidden="true">\{index \+ 1\}<\/span>/u,
  );
  assert.match(guideSource, /width:30px;[\s\S]*height:30px;/u);
  assert.match(guideSource, /border-radius:10px;/u);
  assert.match(guideSource, /background:rgba\(255,201,61,\.1\);/u);
  assert.match(guideSource, /color:#ffc93d;/u);
});

test('Home and Leaderboard info dialogs render one explicit close glyph and suppress generated bars', () => {
  for (const source of [homeGuideInfoSource, leaderboardInfoSource]) {
    assert.match(source, /<span className="veinviteDialogCloseGlyph" aria-hidden="true">×<\/span>/u);
    assert.match(source, /\.veinviteSoftFocusClose::before,[\s\S]*\.veinviteSoftFocusClose::after\s*\{[\s\S]*content: none !important;[\s\S]*display: none !important;/u);
    assert.match(source, /\.veinviteSoftFocusClose\s*\{[\s\S]*border: 0/u);
  }
});

test('Home and Leaderboard info dialogs share the same shell metrics', () => {
  for (const source of [homeGuideInfoSource, leaderboardInfoSource]) {
    assert.match(source, /width: min\(100%,600px\);/u);
    assert.match(source, /max-height: min\(88svh,820px\);/u);
    assert.match(source, /border-radius: 26px;/u);
    assert.match(source, /padding: 0 22px 24px;/u);
    assert.match(source, /border-radius: 22px;/u);
    assert.match(source, /padding: 0 17px 20px;/u);
  }
});

test('Leaderboard info content is grouped in the same rounded guidance card language', () => {
  assert.match(leaderboardInfoSource, /<section className="veinviteImpactInfoCard">/u);
  assert.match(leaderboardInfoSource, /\.veinviteImpactInfoCard\s*\{[\s\S]*border: 1px solid rgba\(255,205,80,\.14\)/u);
  assert.match(leaderboardInfoSource, /border-radius: 22px/u);
  assert.match(leaderboardInfoSource, /radial-gradient\(circle at 90% 0,rgba\(255,194,41,\.1\),transparent 34%\)/u);
  assert.match(leaderboardInfoSource, /font-size: 1\.08rem;/u);
  assert.match(leaderboardInfoSource, /border-top: 1px solid rgba\(255,255,255,\.06\);/u);
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
