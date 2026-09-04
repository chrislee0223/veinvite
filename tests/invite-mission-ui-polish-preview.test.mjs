import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const providers = fs.readFileSync('src/components/AppProviders.tsx', 'utf8');
const visualPolish = fs.readFileSync('src/components/InviteFlowVisualPolish.tsx', 'utf8');
const missionCopy = fs.readFileSync('src/lib/i18n/inviteeMissionCopyPolish.ts', 'utf8');
const missionRuleCopy = fs.readFileSync('src/lib/i18n/inviteeMissionRulePolish.ts', 'utf8');

const supportedLocales = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja', 'it', 'tr', 'nl', 'de', 'fr', 'ar',
  'bn', 'pt', 'ru', 'id', 'vi', 'zh-tw', 'sv', 'ro', 'ur', 'pcm', 'arz',
  'mr', 'te', 'sw', 'ha',
];

test('mission header geometry matches the invite landing header rail', () => {
  assert.match(visualPolish, /\.appShell:has\(> \.appHeader \+ \.missionPanel\)/);
  assert.match(visualPolish, /padding: 22px 18px 42px !important/);
  assert.match(visualPolish, /width: min\(100%, 520px\) !important/);
  assert.match(visualPolish, /gap: 16px !important/);
  assert.match(visualPolish, /margin-bottom: 26px !important/);
  assert.match(visualPolish, /padding: 18px 14px 42px !important/);
  assert.match(visualPolish, /gap: 12px !important/);
  assert.match(visualPolish, /margin-bottom: 22px !important/);
  assert.match(visualPolish, /\.appHeader:has\(\+ \.missionPanel\) > \.brand \+ div/);
  assert.match(visualPolish, /display: contents !important/);
  assert.doesNotMatch(visualPolish, /\.appHeader:has\(\+ \.missionPanel\) > div \{/);
  assert.match(visualPolish, /\.appHeader label/);
  assert.match(visualPolish, /width: 155px !important/);
  assert.match(visualPolish, /max-width: 48% !important/);
  assert.match(visualPolish, /flex: 0 1 155px !important/);
});

test('mission UI polish keeps spacing, readability, and touch targets deliberate', () => {
  assert.match(visualPolish, /\.appHeader:has\(\+ \.missionPanel\) \.chip/);
  assert.match(visualPolish, /\.missionPanel > \.eyebrow/);
  assert.match(visualPolish, /\.missionPanel > h1/);
  assert.match(visualPolish, /margin: 0 0 14px !important/);
  assert.match(visualPolish, /\.missionPanel \.mission\.locked/);
  assert.match(visualPolish, /opacity: \.62 !important/);
  assert.match(visualPolish, /min-height: 44px !important/);
  assert.match(visualPolish, /@media \(max-width: 360px\)/);
  assert.match(visualPolish, /min-width: 64px !important/);
});

test('mission copy overrides load in deterministic order without redundant final layers', () => {
  const hardeningIndex = providers.indexOf("import '@/lib/i18n/copyHardening';");
  const missionCopyIndex = providers.indexOf("import '@/lib/i18n/inviteeMissionCopyPolish';");
  const missionRuleCopyIndex = providers.indexOf("import '@/lib/i18n/inviteeMissionRulePolish';");
  assert.ok(hardeningIndex >= 0);
  assert.ok(missionCopyIndex > hardeningIndex);
  assert.ok(missionRuleCopyIndex > missionCopyIndex);
  assert.doesNotMatch(providers, /inviteeMissionSequenceFinalPolish/);
});

test('mission copy polish covers every supported locale', () => {
  for (const locale of supportedLocales) {
    assert.ok(missionCopy.includes(locale === 'zh-tw' ? "'zh-tw': {" : `${locale}: {`), `missing mission copy for ${locale}`);
    assert.ok(missionRuleCopy.includes(locale === 'zh-tw' ? "'zh-tw': {" : `${locale}: {`), `missing final mission rule copy for ${locale}`);
  }
});

test('Korean mission copy matches the approved wording and one-conversion rule', () => {
  assert.match(missionCopy, /appMission: `서로 다른 dApp 3개에서 B3TR 받기`/);
  assert.match(missionRuleCopy, /appMissionDescription: 'VeBetterDAO dApp을 이용해 각각 B3TR 보상을 받으면 완료돼요\.'/);
  assert.match(missionRuleCopy, /conversionMission: 'B3TR → VOT3 1회 전환'/);
  assert.match(missionRuleCopy, /conversionMissionDescription: '수량과 관계없이 B3TR을 VOT3로 1회 전환하면 완료돼요\.'/);
  assert.doesNotMatch(missionRuleCopy, /첫 dApp/);
  assert.doesNotMatch(missionRuleCopy, /dApp 미션을 완료한 뒤/);
  assert.match(missionRuleCopy, /voteMission: '보상 배분 투표 1회 참여'/);
  assert.match(missionRuleCopy, /voteMissionDescription: 'B3TR → VOT3 전환을 완료한 뒤 보상 배분 투표에 1회 참여하세요\.'/);
  assert.match(missionCopy, /ready: `준비됨`/);
  assert.match(missionCopy, /autoProgress: `미션 진행 상황은 온체인 기록을 통해 자동으로 확인해요\.`/);
});
