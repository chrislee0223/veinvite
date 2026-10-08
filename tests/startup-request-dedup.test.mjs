import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  bootstrap,
  homePage,
  referralPage,
  invitePage,
  walletGate,
  legalGate,
  languageSync,
  countrySync,
  sessionProbe,
  runtimeGuard,
] = await Promise.all([
  readFile(
    new URL('../src/lib/walletSessionBootstrapServer.ts', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/app/page.tsx', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/app/r/[key]/page.tsx', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/app/i/[code]/page.tsx', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/components/WalletSessionGate.tsx', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/components/LegalConsentGate.tsx', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/components/WalletLanguagePreferenceSync.tsx', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/components/WalletCountryObservationSync.tsx', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/lib/walletSessionClientProbe.ts', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../src/components/RuntimeVersionGuard.tsx', import.meta.url),
    'utf8',
  ),
]);

test('server startup bootstrap resolves restriction and legal consent together', () => {
  assert.match(
    bootstrap,
    /Promise\.all\(\[[\s\S]*loadActiveSybilV2Restriction[\s\S]*readInitialLegalConsentStatus/s,
  );
  assert.match(
    bootstrap,
    /initialLegalConsentStatus/,
  );
  assert.match(
    bootstrap,
    /wallet_legal_consents/,
  );
});

test('Home and referral routes seed legal consent into the wallet gate', () => {
  assert.match(homePage, /readWalletSessionBootstrap/);
  assert.doesNotMatch(homePage, /getWalletSessionFromTokens/);
  assert.match(homePage, /initialLegalConsentStatus/);
  assert.match(referralPage, /initialLegalConsentStatus/);
  assert.match(invitePage, /initialLegalConsentStatus/);
  assert.match(walletGate, /initialLegalConsentStatus/);
  assert.match(walletGate, /initialConsentStatus=/);
});

test('legal consent skips the client GET when server state is already known', () => {
  assert.match(
    legalGate,
    /if \(initialConsentStatus === 'accepted'\) \{[\s\S]*setState\('accepted'\);[\s\S]*return;/s,
  );
  assert.match(
    legalGate,
    /if \(initialConsentStatus === 'missing'\) \{[\s\S]*resolveMissingConsent\(\)/s,
  );
  assert.match(
    legalGate,
    /hasLegacyCurrentConsent/,
  );
});

test('startup preference sync shares one short-lived session probe', () => {
  for (const source of [languageSync, countrySync]) {
    assert.match(source, /hasCurrentWalletSession/);
    assert.doesNotMatch(source, /fetch\('\/api\/auth\/session'/);
    assert.match(source, /WALLET_SESSION_READY_EVENT/);
  }

  assert.match(sessionProbe, /fetch\('\/api\/auth\/session'/);
  assert.match(sessionProbe, /inFlightProbe/);
  assert.match(sessionProbe, /SESSION_PROBE_CACHE_MS\s*=\s*2_000/);
});

test('runtime version check waits for startup and browser idle time', () => {
  assert.match(runtimeGuard, /requestIdleCallback/);
  assert.match(runtimeGuard, /APP_READY_EVENT/);
  assert.match(runtimeGuard, /PROVIDER_READY_EVENT/);
  assert.match(
    runtimeGuard,
    /window\.location\.pathname !== '\/'/,
  );
  assert.match(
    runtimeGuard,
    /veinviteAppReady === 'true'/,
  );
  assert.match(
    runtimeGuard,
    /STARTUP_VERSION_CHECK_TIMEOUT_MS = 2_000/,
  );
  assert.doesNotMatch(
    runtimeGuard,
    /useEffect\(\(\) => \{\s*void checkVersion\(true\)/s,
  );
});
