import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  source,
  walletControl,
  walletResume,
  walletRuntime,
  appProviders,
  homeStartupReadiness,
] = await Promise.all([
  readFile('src/components/HomeClient.tsx', 'utf8'),
  readFile('src/components/WalletControl.tsx', 'utf8'),
  readFile('src/components/WalletConnectionResume.tsx', 'utf8'),
  readFile('src/components/WalletRuntimeLifecycle.tsx', 'utf8'),
  readFile('src/components/AppProviders.tsx', 'utf8'),
  readFile('src/lib/homeStartupReadiness.ts', 'utf8'),
]);

test('Home restores permanent referral links from wallet-scoped session storage', () => {
  assert.match(source, /REFERRAL_LINK_SESSION_PREFIX/);
  assert.match(source, /window\.sessionStorage\.getItem\(referralLinkSessionKey\(wallet\)\)/);
  assert.match(source, /wallet\.toLowerCase\(\)/);
  assert.match(source, /isReferralKey\(parsed\.key\)/);
  assert.match(source, /writeCachedReferralLink\(requestWallet, linkData\.referralLink\)/);
});

test('cached links stay non-authoritative until the server verifies them', () => {
  assert.match(source, /setReferralLinkVerified\(false\)/);
  assert.match(source, /setReferralLinkVerified\(true\)/);
  assert.match(source, /disabled=\{!referralLinkVerified \|\| !permanentInviteUrl\}/);
  assert.match(source, /shareDisabled=\{!referralLinkVerified \|\| !permanentInviteUrl\}/);
  assert.match(source, /sameWallet\(activeWalletRef\.current, requestWallet\)/);
});

test('refresh never claims to create a new link and never guesses slot counts', () => {
  assert.doesNotMatch(source, /loading \? t\.creating/);
  assert.match(source, /invitesReady \? \(/);
  assert.match(source, /<span>—\/2<\/span>/);
  assert.match(source, /className="slotSkeleton"/);
});

test('server remains authoritative and the referral ensure endpoint is unchanged', () => {
  assert.match(source, /fetch\('\/api\/referral-links', \{/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /setReferralLink\(linkData\.referralLink\)/);
});

test('explicit wallet connects record a mobile-resume intent before opening the modal', () => {
  assert.match(walletControl, /markWalletConnectIntent\(\);\s*openConnectModal\(\);/);
});

test('VeWorld recovery only arms after the browser actually leaves and returns', () => {
  assert.match(walletResume, /leftPageForWalletRef/);
  assert.match(walletResume, /window\.addEventListener\('pagehide', armDeparture\)/);
  assert.match(walletResume, /window\.addEventListener\('blur', armDeparture\)/);
  assert.match(walletResume, /document\.visibilityState === 'hidden'/);
  assert.match(walletResume, /!leftPageForWalletRef\.current/);
  assert.match(walletResume, /Opening the connect modal itself is not proof/);
  assert.doesNotMatch(walletResume, /isConnectModalOpen\s*\?\s*window\.setInterval/);
});

test('VeWorld app return rehydrates dapp-kit and has a bounded reload fallback', () => {
  assert.match(walletResume, /initializeAsync/);
  assert.match(walletResume, /readPersistedDappKitAccount\(\)/);
  assert.match(walletResume, /RELOAD_GUARD_TTL_MS/);
  assert.match(walletResume, /alreadyReloaded/);
  assert.match(walletResume, /window\.location\.reload\(\)/);
  assert.match(walletResume, /<Brand compact \/>/);
});

test('wallet resume recovery is mounted inside the VeChain provider', () => {
  assert.match(appProviders, /<WalletConnectionResume \/>/);
  assert.match(
    appProviders,
    /<WalletConnectionResume \/>\s*<WalletRuntimeLifecycle \/>/,
  );
});

test('VeWorld refresh shield stays up through wallet restore and explicit Home data readiness', () => {
  assert.match(walletRuntime, /readPersistedDappKitAccount/);
  assert.match(walletRuntime, /hasPersistedVeWorldWallet/);
  assert.match(walletRuntime, /HOME_STARTUP_STATE_EVENT/);
  assert.match(walletRuntime, /readPublishedHomeStartupState/);
  assert.match(walletRuntime, /resolveStartupReadiness/);
  assert.doesNotMatch(walletRuntime, /\.linkPreviewSkeleton, \.slotsSkeleton/);
  assert.doesNotMatch(walletRuntime, /hasPendingHomeData/);

  assert.match(source, /publishHomeStartupState\(\{/);
  assert.match(source, /invitesReady && referralLinkVerified/);
  assert.match(source, /status: hasStartupError/);
  assert.match(source, /setInvitesFailed\(true\)/);
  assert.match(source, /setReferralLinkFailed\(true\)/);

  assert.match(homeStartupReadiness, /hasBootstrappedSession/);
  assert.match(homeStartupReadiness, /hasPersistedWallet/);
  assert.match(
    homeStartupReadiness,
    /if \(hasPersistedWallet \|\| hasBootstrappedSession\) \{\s*return 'hold';/,
  );
  assert.match(homeStartupReadiness, /homeState\?\.status === 'ready'/);
  assert.doesNotMatch(walletRuntime, /HOME_DATA_MAX_WAIT_MS/);
  assert.match(walletRuntime, /HOME_STABILITY_MS/);
});
