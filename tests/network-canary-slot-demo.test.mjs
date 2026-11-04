import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const fixture = readFileSync('src/lib/networkCanaryFixture.ts', 'utf8');
const ownerApi = readFileSync('src/app/api/network/slots/route.ts', 'utf8');
const network = readFileSync('src/components/AppNetwork.tsx', 'utf8');
const publicApi = readFileSync('src/app/api/network/public/route.ts', 'utf8');

test('private canary slots simulate 2/5 in progress and 5/5 completed', () => {
  assert.match(fixture, /slot: 1,\s*state: 'IN_PROGRESS',\s*inviteeWallet: walletFor\(10\),\s*completedSteps: 2,\s*totalSteps: 5/);
  assert.match(fixture, /slot: 2,\s*state: 'IN_PROGRESS',\s*inviteeWallet: walletFor\(3\),\s*completedSteps: 5,\s*totalSteps: 5/);
  assert.match(ownerApi, /if \(await isNetworkCanaryWallet\(wallet\)\) \{/);
  assert.match(ownerApi, /availableSlots: 0,\s*occupiedSlots: \[1, 2\],\s*slots: NETWORK_CANARY_INVITE_SLOTS/);
});

test('finished slot renders mission-complete label', () => {
  assert.match(network, /slot\.completedSteps >= slot\.totalSteps/);
  assert.match(network, /missionsCompleted[\s\S]*t\.qualified/);
  assert.match(network, /\$\{slotStatusLabel\} · \$\{slot\.completedSteps\}\/\$\{slot\.totalSteps\}/);
});

test('public reader does not expose fake slot states', () => {
  assert.match(publicApi, /if \(await isNetworkCanaryWallet\(wallet\)\) \{\s*return null;\s*\}/);
  assert.match(publicApi, /readPublicSlotSnapshot\(focusWallet\)/);
});

test('Home uses the authenticated canary slots only in a display-only overlay', () => {
  const home = readFileSync('src/components/HomeClient.tsx', 'utf8');
  const projection = readFileSync('src/lib/canaryHomeDisplay.ts', 'utf8');
  assert.match(home, /deriveCanaryHomeInvites\(payload, requestWallet\)/);
  assert.match(home, /displayedSlotInvites\.get\(1\)/);
  assert.match(home, /displayedSlotInvites\.get\(2\)/);
  assert.match(home, /const acceptedActiveInvites = useMemo\([\s\S]*slotOccupyingInvites\.filter/);
  assert.doesNotMatch(home, /setInvites\(.*CANARY_VISUAL_ONLY_/);
  assert.match(home, /demoCompleted[\s\S]*demoCompleteLabel/);
  assert.match(projection, /response\.canaryFixture !== true/);
  assert.match(projection, /CANARY_VISUAL_ONLY_/);
  assert.match(ownerApi, /canaryFixture: true/);
});

test('canary home projection produces display-only 2/5 and 5/5 records', async () => {
  const { deriveCanaryHomeInvites } = await import('../src/lib/canaryHomeDisplay.ts');
  const wallet = '0xeff325935b63299e9eeda79931bed6ec119aefcb';
  const data = {
    canaryFixture: true,
    slots: [
      { slot: 1, inviteeWallet: '0xca11ab1e0000000000000000000000000000000a', completedSteps: 2, totalSteps: 5 },
      { slot: 2, inviteeWallet: '0xca11ab1e00000000000000000000000000000003', completedSteps: 5, totalSteps: 5 },
    ],
  };
  const display = deriveCanaryHomeInvites(data, wallet);
  assert.equal(display?.length, 2);
  assert.deepEqual(display?.map((invite) => invite.appsCompleted), [2, 3]);
  assert.deepEqual(display?.map((invite) => invite.status), ['ACTIVATING', 'COMPLETED']);
  assert.deepEqual(display?.map((invite) => invite.vot3Converted), [false, true]);
  assert.deepEqual(display?.map((invite) => invite.voteCompleted), [false, true]);
  assert.deepEqual(display?.map((invite) => invite.rewardEligibility), ['NONE', 'NONE']);
  assert.equal(deriveCanaryHomeInvites({ ...data, canaryFixture: false }, wallet), null);
  assert.equal(deriveCanaryHomeInvites({ ...data, slots: [data.slots[0], data.slots[0]] }, wallet), null);
  assert.equal(deriveCanaryHomeInvites({ ...data, slots: [data.slots[0]] }, wallet), null);
});
