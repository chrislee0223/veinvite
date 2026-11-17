import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/lib/notifications/notificationPresentationGroups.ts', 'utf8');
const state = readFileSync('src/lib/notifications/inviteNotificationStateV2.ts', 'utf8');
const history = readFileSync('src/components/UnifiedInviteNotificationHistoryCenter.tsx', 'utf8');
const modal = readFileSync('src/components/InviteNotificationSurfaceV2.tsx', 'utf8');
const copy = readFileSync('src/lib/i18n/notificationV2Copy.ts', 'utf8');
const typeNames = [...state.match(/export type InviteNotificationKindV2 =([\s\S]*?);/)[1].matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map(m=>m[1]);
const groupEntries = [...source.matchAll(/^\s+([A-Z][A-Z0-9_]+): ('[A-Z][A-Z0-9_]+'|null),?$/gm)].map(m=>[m[1],m[2]==='null'?null:m[2].slice(1,-1)]);

test('the single presentation registry maps every kind into exactly eleven user groups',()=>{
  assert.deepEqual(new Set(groupEntries.map(x=>x[0])),new Set(typeNames));
  const active = groupEntries.filter(([name,group])=>group!==null);
  assert.equal(active.length,18);
  assert.equal(new Set(active.map(x=>x[1])).size,11);
  assert.equal(groupEntries.find(x=>x[0]==='SECURITY_INVITER_WATCH')[1],null);
  assert.match(history,/notificationPresentationGroup\(effectiveKind\)/);
  assert.match(modal,/notificationPresentationGroup\(notification.kind\)/);
});
test('small dApp milestones do not generate extra alerts, but 3\/3 stays',()=>{
  assert.match(state,/appsCompleted === 3 && appsCompleted > readState.dappProgressAcknowledged/);
  assert.match(state,/kind: 'REWARD_READY'/);
  assert.match(state,/kind: 'REWARD_PAID'/);
});
test('paid notices must never append an earlier claim-ready message',()=>{
  assert.doesNotMatch(modal,/\`\$\{v2.rewardReadyBody\} \$\{copy.rewardBody\}\`/);
  assert.match(modal,/case 'REWARD_PAID'/);
});
test('all supported locales have updated reward-ready wording',()=>{
  const readyLines=copy.split('\n').filter(x=>/^  (?:'[^']+'|[a-z]+): \{.*rewardReadyBody:/u.test(x));
  assert.equal(readyLines.length,29);
  for (const line of readyLines) {
    assert.match(line,/VeInvite/);
  }
});
