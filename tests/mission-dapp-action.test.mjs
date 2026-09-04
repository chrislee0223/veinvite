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

test('approved dApp mission wording loads after shared copy hardening', () => {
  const hardening = providers.indexOf("import '@/lib/i18n/copyHardening';");
  const copy = providers.indexOf("import '@/lib/i18n/inviteeMissionCopyPolish';");
  assert.ok(hardening >= 0 && copy > hardening);

  assert.match(missionCopy, /appMission: '서로 다른 dApp 3개에서 B3TR 받기'/);
  assert.match(missionCopy, /ready: '준비됨'/);
  assert.match(missionCopy, /autoProgress: '미션 진행 상황은 온체인 기록을 통해 자동으로 확인해요\.'/);
});
