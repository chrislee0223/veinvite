import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync('src/components/HomeClient.tsx', 'utf8');
const settings = readFileSync('src/components/AppSettings.tsx', 'utf8');
const snackbar = readFileSync('src/components/TransientSnackbar.tsx', 'utf8');
const network = readFileSync('src/components/AppNetwork.tsx', 'utf8');
const invitee = readFileSync('src/components/InviteeClient.tsx', 'utf8');
const permanent = readFileSync('src/components/PermanentReferralClient.tsx', 'utf8');
const globals = readFileSync('src/app/globals.css', 'utf8');

test('home cancel dialog keeps mounted content through shared enter and exit motion', () => {
  assert.match(home, /legacyCancelVisible/);
  assert.match(home, /softFocusCloseDelay/);
  assert.match(home, /modalBackdrop veinviteSoftFocusBackdrop/);
  assert.match(home, /modalCard veinviteSoftFocusPanel/);
  assert.match(home, /data-open=\{legacyCancelVisible \? 'true' : 'false'\}/);
});

test('settings wallet confirmation keeps mounted content through shared enter and exit motion without duplicate actions', () => {
  assert.match(settings, /walletConfirmationVisible/);
  assert.match(settings, /walletConfirmationCloseTimerRef/);
  assert.match(settings, /confirmationBackdrop veinviteSoftFocusBackdrop/);
  assert.match(settings, /confirmationModal veinviteSoftFocusPanel/);
  assert.match(settings, /closeWalletConfirmation\(false\)/);
  assert.match(settings, /isWalletActionPending \|\|[\s\S]*walletConfirmationCloseTimerRef\.current !== null/);
});

test('snackbar has a matched exit motion and skips it for reduced motion', () => {
  assert.match(snackbar, /const EXIT_MS = 140/);
  assert.match(snackbar, /transientSnackbar\.closing/);
  assert.match(snackbar, /@keyframes snackbar-out/);
  assert.match(snackbar, /prefers-reduced-motion: reduce/);
  assert.match(snackbar, /requestDismiss/);
});

test('primary actions use restrained press feedback and disable transforms for reduced motion', () => {
  assert.match(home, /transform:scale\(\.98\)/);
  assert.match(settings, /transform:scale\(\.98\)/);
  assert.match(globals, /\.primaryButton:active:not\(:disabled\),\.secondaryButton:active:not\(:disabled\)\{transform:scale\(\.98\)\}/);
  assert.match(globals, /prefers-reduced-motion:reduce/);
});

test('invite onboarding steps use the shared short entrance motion', () => {
  assert.match(globals, /inviteStepIn 150ms/);
  assert.match(invitee, /function Centered\([\s\S]*?<main className="centeredFlow inviteStepMotion">/);
  assert.match(permanent, /function Centered\([\s\S]*?<main className="centeredFlow inviteStepMotion">/);
  assert.match(invitee, /key=\{step\}/);
  assert.match(permanent, /key=\{step\}/);
});

test('network panels get restrained entrance motion while reduced-motion removes node scaling', () => {
  assert.match(network, /networkPanelIn 120ms/);
  assert.match(network, /\.groupsPanel,\.groupBuilder\{[^}]*animation:networkPanelIn 120ms/);
  assert.match(network, /\.profileCard\{[^}]*animation:networkPanelIn 120ms/);
  assert.match(network, /prefers-reduced-motion:reduce/);
  assert.match(network, /\.personNode:hover \.nodeCircle[\s\S]*transform:scale\(var\(--network-node-scale,1\)\)!important/);
  assert.match(network, /\.focusNode:hover \.focusCircle[\s\S]*transform:scale\(var\(--network-center-scale,1\)\)!important/);
});

test('leaderboard wallet detail close timer cannot leak into a newly opened dialog', () => {
  const leaderboard = readFileSync('src/components/InviterLeaderboard.tsx', 'utf8');
  assert.match(
    leaderboard,
    /openWalletDetails[\s\S]*walletDetailCloseTimerRef\.current !== null[\s\S]*clearTimeout\(walletDetailCloseTimerRef\.current\)/,
  );
  assert.match(
    leaderboard,
    /openImpactDetails[\s\S]*walletDetailCloseTimerRef\.current !== null[\s\S]*clearTimeout\(walletDetailCloseTimerRef\.current\)/,
  );
});
