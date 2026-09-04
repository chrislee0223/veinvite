import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const invitee = await readFile(
  new URL('../src/components/InviteeClient.tsx', import.meta.url),
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
