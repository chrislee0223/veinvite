import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('anonymous visitors see VeInvite before wallet verification or legal consent', async () => {
  const gateSource = await readFile(
    new URL('../src/components/WalletSessionGate.tsx', import.meta.url),
    'utf8',
  );
  const homeSource = await readFile(
    new URL('../src/components/HomeClient.tsx', import.meta.url),
    'utf8',
  );

  const anonymousReturn = gateSource.indexOf(
    "if (!walletAddress) {\n    return children;\n  }",
  );
  const verifiedBranch = gateSource.indexOf(
    "state === 'verified'",
  );
  const legalGate = gateSource.indexOf('<LegalConsentGate');

  assert.ok(anonymousReturn >= 0);
  assert.ok(verifiedBranch > anonymousReturn);
  assert.ok(legalGate > verifiedBranch);
  assert.match(
    homeSource,
    /!wallet \? \([\s\S]*className="primaryAction"[\s\S]*openWallet\(\)[\s\S]*t\.connectStart/s,
  );
});

test('first wallet login re-arms Home startup readiness after anonymous Home was already visible', async () => {
  const source = await readFile(
    new URL('../src/components/WalletRuntimeLifecycle.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /APP_LOADING_EVENT\s*=\s*'veinvite-app-loading'/);
  assert.match(source, /lastStartupWalletRef/);
  assert.match(source, /releasedRef\.current\s*=\s*false/);
  assert.match(
    source,
    /dataset\.veinviteAppReady\s*=\s*'false'/,
  );
  assert.match(
    source,
    /dispatchEvent\(new Event\(APP_LOADING_EVENT\)\)/,
  );
});

test('startup shield can be re-armed for first login and released again only after final Home readiness', async () => {
  const source = await readFile(
    new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /APP_LOADING_EVENT\s*=\s*'veinvite-app-loading'/);
  assert.match(source, /const handleAppLoading = \(\) =>/);
  assert.match(source, /released\s*=\s*false/);
  assert.match(source, /setState\(\{ status: 'loading' \}\)/);
  assert.match(
    source,
    /addEventListener\(\s*APP_LOADING_EVENT,\s*handleAppLoading/s,
  );
  assert.doesNotMatch(
    source,
    /APP_READY_EVENT,\s*handleAppReady,\s*\{ once: true \}/s,
  );
});

test('transient wallet verification failures stay on checking UI before showing a real error', async () => {
  const source = await readFile(
    new URL('../src/components/WalletSessionGate.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /SESSION_ERROR_SURFACE_DELAY_MS\s*=\s*600/,
  );
  assert.match(source, /pendingErrorTimerRef/);
  assert.match(
    source,
    /pendingErrorTimerRef\.current\s*=\s*window\.setTimeout\([\s\S]*setState\('error'\)[\s\S]*SESSION_ERROR_SURFACE_DELAY_MS/s,
  );
  assert.doesNotMatch(
    source,
    /setVerifiedWallet\(null\);\s*setState\('error'\);/s,
  );
});

test('legal consent motion starts only after authoritative consent is saved and always completes safely', async () => {
  const source = await readFile(
    new URL('../src/components/LegalConsentGate.tsx', import.meta.url),
    'utf8',
  );

  const handlerStart = source.indexOf(
    'const acceptCurrentDocuments',
  );
  const acceptedBranch = source.indexOf(
    "if (state === 'accepted')",
    handlerStart,
  );
  const handler = source.slice(
    handlerStart,
    acceptedBranch,
  );
  const persisted = handler.indexOf(
    "await recordConsent('ui')",
  );
  const exitStarted = handler.indexOf(
    'setIsExiting(true)',
  );

  assert.ok(handlerStart >= 0);
  assert.ok(acceptedBranch > handlerStart);
  assert.ok(persisted >= 0);
  assert.ok(exitStarted > persisted);
  assert.doesNotMatch(
    handler,
    /setState\('accepted'\)/,
  );

  assert.match(
    source,
    /LEGAL_CONSENT_EXIT_FALLBACK_MS\s*=\s*260/,
  );
  assert.match(
    source,
    /prefersReducedMotion\(\)[\s\S]*completeAcceptedTransition\(\)/s,
  );
  assert.match(
    source,
    /matchMedia\?\.\([\s\S]*prefers-reduced-motion: reduce/s,
  );
  assert.match(
    source,
    /window\.setTimeout\([\s\S]*LEGAL_CONSENT_EXIT_FALLBACK_MS/s,
  );
  assert.match(
    source,
    /onTransitionEnd=\{\(event\) => \{[\s\S]*event\.propertyName === 'opacity'[\s\S]*completeAcceptedTransition\(\)/s,
  );
  assert.match(
    source,
    /data-veinvite-legal-consent-gate="interactive"/,
  );
  assert.match(
    source,
    /data-exiting=\{isExiting \? 'true' : 'false'\}/,
  );
  assert.match(
    source,
    /isAccepting \|\| isDisconnecting \|\| isExiting/,
  );
  assert.match(
    source,
    /@keyframes veinviteLegalConsentBackdropIn/,
  );
  assert.match(
    source,
    /@keyframes veinviteLegalConsentPanelIn/,
  );
  assert.match(
    source,
    /@media \(prefers-reduced-motion: reduce\)/,
  );
});
