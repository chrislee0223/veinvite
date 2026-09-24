import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [network, explorer, publicApi, identity] = await Promise.all([
  readFile('src/components/AppNetwork.tsx', 'utf8'),
  readFile('src/components/PublicNetworkExplorer.tsx', 'utf8'),
  readFile('src/app/api/network/public/route.ts', 'utf8'),
  readFile('src/components/NetworkWalletIdentity.tsx', 'utf8'),
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

test('public focus slot metadata exposes only empty slot IDs and no invitee details', () => {
  assert.match(publicApi, /readPublicAvailableSlotIds\(focusWallet\)/);
  assert.match(publicApi, /availableSlotIds/);
  assert.match(publicApi, /slotAvailabilityKnown/);
  assert.doesNotMatch(publicApi, /invitee_wallet|apps_completed|vot3_converted|vote_completed/);
});

test('friend Network slots share owner coordinates, edges, motion reduction, and read-only behavior', () => {
  assert.match(explorer, /CENTER_X - 58/);
  assert.match(explorer, /CENTER_X \+ 64/);
  assert.match(explorer, /publicSlotEdgeBase/);
  assert.match(explorer, /publicSlotEdgePulse/);
  assert.match(explorer, /publicSlotFlow/);
  assert.match(explorer, /prefers-reduced-motion:reduce[\s\S]*publicSlotEdgePulse/);
  assert.match(explorer, /\.publicSlotNode\{[^}]*pointer-events:none/);
});

test('slot lookup failure preserves known focus slots and retries once without blocking the graph', () => {
  assert.match(explorer, /previous\?\.slotAvailabilityKnown === true/);
  assert.match(explorer, /slotRetryAttemptedRef\.current\.has\(focusKey\)/);
  assert.match(explorer, /window\.setTimeout\(async \(\) =>/);
  assert.match(explorer, /controller\.abort\(\)/);
});

test('center identities keep cached display state while revalidating VeWorld identity', () => {
  assert.match(identity, /root \|\|/);
  assert.match(identity, /displayDomain === undefined/);
  assert.match(identity, /displayDomain === null && Boolean\(displayUrl\)/);
  assert.match(identity, /readCachedProfileAvatar\(address\)/);
  assert.match(identity, /objectFit: 'contain'/);
});
