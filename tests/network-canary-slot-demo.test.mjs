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
  assert.match(home, /const finalChecking = allMissions && !invite\.slotReleasedAt/);
  assert.doesNotMatch(home, /demoOnly|demoCompleted|demoCompleteLabel/);
  assert.match(projection, /response\.canaryFixture !== true/);
  assert.match(projection, /CANARY_VISUAL_ONLY_/);
  assert.match(ownerApi, /canaryFixture: true/);
});

test('canary home projection produces display-only 2/5 and 5/5 records', async () => {
  const { deriveCanaryHomeInvites } = await import('../src/lib/canaryHomeDisplay.ts');
  const wallet = '0x1234567890abcdef1234567890abcdef12345678';
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

test('Home invitation wallets use the same compact 0xXXX…XXX format as Network and never wrap', async () => {
  const home = readFileSync('src/components/HomeClient.tsx', 'utf8');
  const { nodeWallet } = await import('../src/lib/networkAppViewHelpers.ts');
  assert.equal(nodeWallet('0xabcdef0000000000000000000000000000000123'), '0xABC…123');
  assert.match(home, /const shortInvitee = invite\.inviteeAddress\s*\? nodeWallet\(invite\.inviteeAddress\)/);
  assert.match(home, /className="inviteeWalletLabel"/);
  assert.match(home, /\.slotTop \.inviteeWalletLabel \{[^}]*white-space:nowrap;/);
  assert.match(home, /title=\{invite\.inviteeAddress\}/);
});

test('canary UI has no extra test or public-network badges, while public explorer stays unchanged', () => {
  const home = readFileSync('src/components/HomeClient.tsx', 'utf8');
  const network = readFileSync('src/components/AppNetwork.tsx', 'utf8');
  const networkSync = readFileSync('src/hooks/useNetworkPublishedLayoutSync.ts', 'utf8');
  const publicExplorer = readFileSync('src/components/PublicNetworkExplorer.tsx', 'utf8');

  assert.match(home, /<span>\{displayedSlotInvites\.size\}\/2<\/span>/);
  assert.doesNotMatch(home, / · TEST|demoOnly|demoCompleteLabel/);
  assert.match(home, /displayedSlotInvites\.get\(1\)/);
  assert.match(home, /displayedSlotInvites\.get\(2\)/);
  assert.match(home, /deriveCanaryHomeInvites\(payload, requestWallet\)/);
  assert.doesNotMatch(network, /className="publicLayoutBadge"|\.publicLayoutBadge\{/);
  assert.match(network, /currentData\?\.publicLayoutPublishingEnabled === true/);
  assert.match(network, /<span>\{e\.visibleNetwork\}<\/span>/);
  assert.doesNotMatch(networkSync, /publicNetworkCopy/);
  assert.match(networkSync, /setNotice\(layoutSavedCopy, 1600\)/);
  assert.match(publicExplorer, /className="otherNetworkBadge"/);
});

test('2/5 owner-only visual slot gets the same x and confirmation, never a live release request', () => {
  const home = readFileSync('src/components/HomeClient.tsx', 'utf8');
  const projection = readFileSync('src/lib/canaryHomeDisplay.ts', 'utf8');
  assert.match(home, /canaryReleaseEnabled=\{showingCanarySlots\}/);
  assert.match(home, /canaryReleaseEnabled && invite\.code === 'CANARY_VISUAL_ONLY_1' && !allMissions/);
  assert.match(home, /const isCanaryDemoRelease = Boolean\(canaryHomeDisplay/);
  assert.match(home, /if \(isCanaryDemoRelease\) \{[\s\S]*releaseCanarySlotDemo\(requestWallet, 1\)[\s\S]*return;[\s\S]*clearFeedback\(\);[\s\S]*setLoading\(true\);[\s\S]*fetch\(/);
  assert.match(home, /cancelTarget\.inviteeAddress[\s\S]*releaseAcceptedInvite\(\)/);
  assert.match(home, /const displayedSlotInvites = useMemo/);
  assert.match(projection, /rewardEligibility: 'NONE'/);
  assert.match(projection, /CANARY_VISUAL_ONLY_/);
  assert.doesNotMatch(projection, /rewardEligibility: 'PENDING'/);
});

test('visual x release affects Home and Network only for this wallet until page reload', async () => {
  const { releaseCanarySlotDemo, isCanarySlotDemoReleased, applyCanarySlotDemoRelease } =
    await import('../src/lib/canarySlotDemoState.ts');
  const wallet = '0x1234567890abcdef1234567890abcdef12345678';
  const another = '0x876543210abcdef1234567890abcdef123456789';
  const slots = [
    { slot: 1, state: 'IN_PROGRESS', inviteeWallet: '0xca11ab1e0000000000000000000000000000000a', completedSteps: 2, totalSteps: 5 },
    { slot: 2, state: 'IN_PROGRESS', inviteeWallet: '0xca11ab1e00000000000000000000000000000003', completedSteps: 5, totalSteps: 5 },
  ];
  assert.equal(releaseCanarySlotDemo(wallet, 2), false);
  assert.equal(isCanarySlotDemoReleased(wallet, 1), false);
  assert.equal(releaseCanarySlotDemo(wallet, 1), true);
  assert.equal(isCanarySlotDemoReleased(wallet, 1), true);
  assert.equal(isCanarySlotDemoReleased(another, 1), false);
  const view = applyCanarySlotDemoRelease(wallet, slots);
  assert.deepEqual(view[0], { slot: 1, state: 'AVAILABLE', inviteeWallet: null, completedSteps: 0, totalSteps: 5 });
  assert.deepEqual(view[1], slots[1]);
  assert.deepEqual(applyCanarySlotDemoRelease(another, slots), slots);
  assert.deepEqual(slots[0].inviteeWallet, '0xca11ab1e0000000000000000000000000000000a');
  const home = readFileSync('src/components/HomeClient.tsx', 'utf8');
  const network = readFileSync('src/components/AppNetwork.tsx', 'utf8');
  assert.match(home, /!isCanarySlotDemoReleased\(requestWallet, invite\.inviteSlot as 1 \| 2\)/);
  assert.match(network, /applyVerifiedCanarySlotDemoResponse\(wallet, payload, slots\)/);
  assert.doesNotMatch(network, /canaryFixture|isNetworkCanaryWallet/);
  assert.match(network, /CANARY_SLOT_DEMO_RELEASED_EVENT/);
});
