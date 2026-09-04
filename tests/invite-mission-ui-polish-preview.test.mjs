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

test('mission header geometry keeps the grouped brand and picker on content edges', () => {
  assert.match(visualPolish, /\.appHeader:has\(\+ \.missionPanel\) > \.brand \+ div/);
  assert.match(visualPolish, /display: contents !important/);
  assert.doesNotMatch(visualPolish, /\.appHeader:has\(\+ \.missionPanel\) > div \{/);
  assert.match(visualPolish, /\.appHeader label/);
  assert.match(visualPolish, /width: 155px !important/);
  assert.match(visualPolish, /max-width: 155px !important/);
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

test('mission copy polish loads after shared copy hardening and final rule copy loads last', () => {
  const hardeningIndex = providers.indexOf("import '@/lib/i18n/copyHardening';");
  const missionCopyIndex = providers.indexOf("import '@/lib/i18n/inviteeMissionCopyPolish';");
  const missionRuleCopyIndex = providers.indexOf("import '@/lib/i18n/inviteeMissionRulePolish';");
  assert.ok(hardeningIndex >= 0);
  assert.ok(missionCopyIndex > hardeningIndex);
  assert.ok(missionRuleCopyIndex > missionCopyIndex);
});

test('mission copy polish covers every supported locale', () => {
  for (const locale of supportedLocales) {
    const key = locale === 'zh-tw' ? "'zh-tw': {" : `${locale}: {`;
    assert.ok(missionCopy.includes(key), `missing mission copy for ${locale}`);
    assert.ok(missionRuleCopy.includes(key), `missing final mission rule copy for ${locale}`);
  }
});

test('Korean mission copy matches the approved wording and one-conversion rule', () => {
  assert.match(missionCopy, /appMission: `서로 다른 dApp 3개에서 B3TR 받기`/);
  assert.match(missionRuleCopy, /appMissionDescription: 'VeBetterDAO dApp을 이용해 각각 B3TR 보상을 받으면 완료돼요\.'/);
  assert.match(missionRuleCopy, /conversionMission: 'B3TR → VOT3 1회 전환'/);
  assert.match(missionRuleCopy, /conversionMissionDescription: '첫 dApp 보상을 받은 뒤 B3TR을 VOT3로 1회 전환하세요\.'/);
  assert.doesNotMatch(missionRuleCopy, /최소 1 B3TR/);
  assert.match(missionCopy, /voteMissionDescription: `B3TR → VOT3 전환을 완료한 뒤 Allocation Voting에 1회 참여하세요\.`/);
  assert.match(missionCopy, /ready: `준비됨`/);
  assert.match(missionCopy, /autoProgress: `미션 진행 상황은 온체인 기록을 통해 자동으로 확인해요\.`/);
});
