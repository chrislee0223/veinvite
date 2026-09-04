import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const invitee = await readFile(
  new URL('../src/components/InviteeClient.tsx', import.meta.url),
  'utf8',
);
const providers = await readFile(
  new URL('../src/components/AppProviders.tsx', import.meta.url),
  'utf8',
);
const visualPolish = await readFile(
  new URL('../src/components/InviteFlowVisualPolish.tsx', import.meta.url),
  'utf8',
);
const missionCopy = await readFile(
  new URL('../src/lib/i18n/inviteeMissionCopyPolish.ts', import.meta.url),
  'utf8',
);
const missionRules = await readFile(
  new URL('../src/lib/i18n/inviteeMissionRulePolish.ts', import.meta.url),
  'utf8',
);
const vot3Conversion = await readFile(
  new URL('../src/lib/vebetter/vot3Conversion.ts', import.meta.url),
  'utf8',
);

test('dApp progress opens the official VeBetterDAO apps page only while incomplete', () => {
  assert.match(
    invitee,
    /const VEBETTER_APPS_URL = 'https:\/\/governance\.vebetterdao\.org\/apps';/,
  );
  assert.match(
    invitee,
    /actionHref=\{appsDone \? undefined : VEBETTER_APPS_URL\}/,
  );
  assert.match(
    invitee,
    /\$\{appsCompleted\}\/\$\{progress\.appsRequired\}\$\{appsDone \? ' ✓' : ''\}/,
  );
  assert.doesNotMatch(invitee, /target=["']_blank["']/);
});

test('mission status badges share one sizing rule and isolate numeric direction', () => {
  assert.match(invitee, /minWidth: '72px'/);
  assert.match(invitee, /minHeight: '40px'/);
  assert.match(invitee, /borderRadius: '999px'/);
  assert.match(invitee, /statusDirection="ltr"/);
  assert.match(invitee, /unicodeBidi: 'isolate'/);
  assert.match(visualPolish, /\.missionPanel \.mission > a,/);
  assert.match(visualPolish, /min-height: 44px !important/);
});

test('mission progress reconciles on return without duplicate burst requests', () => {
  assert.match(invitee, /const RESUME_SYNC_COOLDOWN_MS = 5_000;/);
  assert.match(invitee, /let syncInFlight = false;/);
  assert.match(invitee, /document\.visibilityState !== 'visible'/);
  assert.match(invitee, /addEventListener\('visibilitychange', reconcileOnResume\)/);
  assert.match(invitee, /addEventListener\('focus', reconcileOnResume\)/);
  assert.match(invitee, /addEventListener\('pageshow', reconcileOnResume\)/);
  assert.match(invitee, /setInterval\(reconcile, 30_000\)/);
});

test('mission screen keeps the approved shared header geometry and compact picker', () => {
  assert.match(visualPolish, /padding: 22px 18px 42px !important/);
  assert.match(visualPolish, /width: min\(100%, 520px\) !important/);
  assert.match(visualPolish, /gap: 16px !important/);
  assert.match(visualPolish, /margin-bottom: 26px !important/);
  assert.match(visualPolish, /padding: 18px 14px 42px !important/);
  assert.match(visualPolish, /gap: 12px !important/);
  assert.match(visualPolish, /margin-bottom: 22px !important/);
  assert.match(visualPolish, /\.appHeader:has\(\+ \.missionPanel\) \.chip/);
  assert.match(visualPolish, /\.missionPanel > \.eyebrow/);
  assert.match(visualPolish, /width: 155px !important/);
  assert.match(visualPolish, /\.headerLanguageTrigger/);
  assert.match(visualPolish, /min-height: 44px !important/);
  assert.match(visualPolish, /padding-top: 5px !important/);
  assert.match(visualPolish, /padding-bottom: 5px !important/);
  assert.match(visualPolish, /opacity: \.62 !important/);
  assert.match(visualPolish, /color: #b8b4aa !important/);
  assert.match(visualPolish, /font-weight: 600 !important/);
});

test('approved Korean mission wording loads after shared copy hardening', () => {
  const hardening = providers.indexOf("import '@/lib/i18n/copyHardening';");
  const copy = providers.indexOf("import '@/lib/i18n/inviteeMissionCopyPolish';");
  const rules = providers.indexOf("import '@/lib/i18n/inviteeMissionRulePolish';");
  assert.ok(hardening >= 0 && copy > hardening && rules > copy);

  assert.match(missionCopy, /appMission: '서로 다른 dApp 3개에서 B3TR 받기'/);
  assert.match(missionCopy, /ready: '준비됨'/);
  assert.match(missionCopy, /autoProgress: '미션 진행 상황은 온체인 기록을 통해 자동으로 확인해요\.'/);
  assert.match(missionRules, /appMissionDescription: 'VeBetterDAO dApp을 이용해 각각 B3TR 보상을 받으면 완료돼요\.'/);
  assert.match(missionRules, /conversionMission: 'B3TR → VOT3 1회 전환'/);
  assert.match(missionRules, /conversionMissionDescription: '수량과 관계없이 B3TR을 VOT3로 1회 전환하면 완료돼요\.'/);
  assert.match(missionRules, /voteMission: '보상 배분 투표 1회 참여'/);
  assert.match(missionRules, /voteMissionDescription: 'B3TR → VOT3 전환을 완료한 뒤 보상 배분 투표에 1회 참여하세요\.'/);
});

test('VOT3 mission accepts one positive conversion while rejecting zero-value events', () => {
  assert.match(vot3Conversion, /export const MIN_VOT3_CONVERSION_WEI = 1n;/);
  assert.match(vot3Conversion, /BigInt\(event\.amountWei\) >=\s*MIN_VOT3_CONVERSION_WEI/);
  assert.match(vot3Conversion, /BigInt\(event\.amountWei\) <\s*MIN_VOT3_CONVERSION_WEI/);
  assert.match(vot3Conversion, /isStrictlyAfter\(\s*event,\s*firstRewardPosition/);
  assert.match(vot3Conversion, /b3trDebitKeys\.has\(\s*eventMatchKey\(event\)/);
});
