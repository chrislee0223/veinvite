import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [network, explorer, publicApi, identity, networkGeometry, ownerLayoutView, slotRetryHook, publicSlots] = await Promise.all([
  readFile('src/components/AppNetwork.tsx', 'utf8'),
  readFile('src/components/PublicNetworkExplorer.tsx', 'utf8'),
  readFile('src/app/api/network/public/route.ts', 'utf8'),
  readFile('src/components/NetworkWalletIdentity.tsx', 'utf8'),
  readFile('src/lib/networkCanvasGeometry.ts', 'utf8'),
  readFile('src/lib/networkPublicOwnerLayoutView.ts', 'utf8'),
  readFile('src/hooks/usePublicNetworkSlotRetry.ts', 'utf8'),
  readFile('src/components/PublicNetworkInviteSlots.tsx', 'utf8'),
]);

test('My Network root stays at the same coordinate with avatar plus one identity line', () => {
  assert.match(network, /style=\{\{ left: FOCUS_X, top: FOCUS_Y \}\}/);
  assert.match(network, /<NetworkWalletIdentity[\s\S]*size=\{56\}/);
  assert.match(network, /rootIdentityOnly/);
  assert.doesNotMatch(network, /focusYouLabel/);
});

test('center ring geometry stays 56px avatar, 60px inner ring, and 74px animated outer ring', () => {
  assert.match(network, /\.focusNode\{[^}]*width:74px[^}]*height:74px/);
  assert.match(network, /\.focusCircle\{[^}]*inset:7px[^}]*z-index:2/);
  assert.match(
    network,
    /\.focusNode::before\{[^}]*inset:0[^}]*scale:var\(--network-center-scale,1\)/,
  );
  assert.match(
    network,
    /\.focusNode::after\{[^}]*inset:0[^}]*background:radial-gradient[^}]*scale:var\(--network-center-scale,1\)/,
  );
  assert.match(
    network,
    /\.focusNode \.nodeCircle :global\(\.avatarSlot\)[^\n]*56px!important/,
  );

  assert.match(
    explorer,
    /\.publicNode\.root\{[^}]*width:74px[^}]*height:74px[^}]*background:radial-gradient/,
  );
  assert.match(
    explorer,
    /\.publicNode\.root \.publicAvatar\{[^}]*inset:7px[^}]*width:auto[^}]*height:auto[^}]*position:absolute/,
  );
  assert.match(
    explorer,
    /\.publicNode\.root \.publicAvatar::after\{[^}]*inset:-7px/,
  );
  assert.match(explorer, /size=\{visual\.root \? 56 : 40\}/);
});

test('friend Network focus bloom keeps root geometry stable while preserving navigation cues', () => {
  assert.match(
    explorer,
    /\.publicNode\.root\.bloom:not\(\.selected\) \.publicAvatar\{animation:publicNodeBloom 620ms cubic-bezier\(\.16,\.82,\.2,1\) both\}/,
  );
  const bloomKeyframes = explorer.match(/@keyframes publicNodeBloom\{([^}]|\}(?!@keyframes))*\}/)?.[0] ?? '';
  assert.ok(bloomKeyframes, 'publicNodeBloom keyframes must exist');
  assert.doesNotMatch(bloomKeyframes, /transform:|scale\(/);
  assert.match(bloomKeyframes, /55%\{box-shadow:0 0 42px rgba\(244,183,40,\.22\)\}/);
  assert.match(bloomKeyframes, /100%\{box-shadow:0 0 22px rgba\(244,183,40,\.025\)\}/);
  assert.match(explorer, /bloom\(root\)/);
  assert.match(explorer, /bloom\(payload\.focusWallet\)/);
  assert.match(explorer, /bloom\(target\)/);
  assert.match(explorer, /publicRootBreath 2\.8s ease-in-out infinite/);
  assert.match(
    explorer,
    /prefers-reduced-motion:reduce[\s\S]*\.publicNode\.root\.bloom:not\(\.selected\) \.publicAvatar/,
  );
});

test('public focus exposes anonymous state for both slots without browser invitee detail', () => {
  assert.match(publicApi, /readPublicSlotSnapshot\(focusWallet\)/);
  assert.match(publicApi, /slots\?: PublicInviteSlotMetadata\[\]/);
  assert.match(publicApi, /'AVAILABLE' \| 'PENDING' \| 'IN_PROGRESS'/);
  assert.match(publicApi, /occupiedInviteeWallets/);
  assert.match(
    publicApi,
    /payload\.children = payload\.children\.filter[\s\S]*occupiedInviteeWallets/u,
  );
  assert.match(
    publicApi,
    /allowedSlotIds: slotSnapshot[\s\S]*slotSnapshot\.slots\.map/u,
  );
  assert.match(publicApi, /slotAvailabilityKnown/);
  assert.doesNotMatch(publicApi, /apps_completed|vot3_converted|vote_completed/);
  assert.doesNotMatch(
    publicApi,
    /payload\.slots[\s\S]{0,300}invitee_wallet/u,
  );
});

test('friend Network slots share owner coordinates, edges, motion reduction, and read-only behavior', () => {
  assert.match(
    ownerLayoutView,
    /networkCanvasInviteSlotPointById/,
  );
  assert.match(
    networkGeometry,
    /NETWORK_CANVAS_CENTER_X - 58/,
  );
  assert.match(
    networkGeometry,
    /NETWORK_CANVAS_CENTER_X \+ 64/,
  );
  assert.match(publicSlots, /publicSlotEdgeBase/);
  assert.match(publicSlots, /publicSlotEdgeProgress/);
  assert.match(publicSlots, /publicSlotEdgePulse/);
  assert.match(publicSlots, /data-slot-state=\{slot\.state\}/);
  assert.match(publicSlots, /publicSlotFlow/);
  assert.match(publicSlots, /prefers-reduced-motion:reduce[\s\S]*publicSlotEdgePulse/);
  assert.match(publicSlots, /\.publicSlotNode\s*\{[^}]*pointer-events:none/);
  assert.match(publicSlots, /\.publicSlotNode\s*\{[^}]*width:52px[^}]*height:52px/);
  assert.doesNotMatch(explorer, /\.publicSlotNode\{/);
});

test('public owner layout keeps both occupied and available slots at owner-authored coordinates', () => {
  assert.match(ownerLayoutView, /focusData\.slots/);
  assert.match(ownerLayoutView, /state: PublicSlotState/);
  assert.match(ownerLayoutView, /workspace\.positions[\s\S]*slot:/u);
  assert.match(ownerLayoutView, /inviteeWallet: null/);
});

test('slot lookup failure preserves known focus slots and retries once without blocking the graph', () => {
  assert.match(explorer, /previous\?\.slotAvailabilityKnown === true/);
  assert.match(slotRetryHook, /retryAttemptedRef\.current\.has\([\s\S]*focusKey/);
  assert.match(slotRetryHook, /window\.setTimeout\(async \(\) =>/);
  assert.match(slotRetryHook, /controller\.abort\(\)/);
});

test('center identities keep cached display state while revalidating VeWorld identity', () => {
  assert.match(identity, /root \|\|/);
  assert.match(identity, /displayDomain === undefined/);
  assert.match(identity, /displayDomain === null && Boolean\(displayUrl\)/);
  assert.match(identity, /readCachedProfileAvatar\(address\)/);
  assert.match(identity, /objectFit: 'contain'/);
});
