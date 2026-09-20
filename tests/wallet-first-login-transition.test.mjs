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

  const disconnectedBranch = gateSource.indexOf(
    'if (!walletAddress) {',
  );
  const anonymousReturn = gateSource.indexOf(
    'return children;',
    disconnectedBranch,
  );
  const verifiedBranch = gateSource.indexOf(
    "state === 'verified'",
    anonymousReturn,
  );
  const legalGate = gateSource.indexOf(
    '<LegalConsentGate',
    verifiedBranch,
  );

  assert.ok(disconnectedBranch >= 0);
  assert.match(
    gateSource.slice(disconnectedBranch, anonymousReturn),
    /sessionWalletRef\.current[\s\S]*verifiedWallet[\s\S]*WalletSessionBrandSurface/,
  );
  assert.ok(anonymousReturn > disconnectedBranch);
  assert.ok(verifiedBranch > anonymousReturn);
  assert.ok(legalGate > verifiedBranch);
  assert.match(
    homeSource,
    /!wallet \? \([\s\S]*className="primaryAction"[\s\S]*openWallet\(\)[\s\S]*t\.connectStart/s,
  );
});

test('first wallet login re-arms internal Home readiness without replaying the global startup shield', async () => {
  const [runtime, gate] = await Promise.all([
    readFile(
      new URL('../src/components/WalletRuntimeLifecycle.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/components/WalletSessionGate.tsx', import.meta.url),
      'utf8',
    ),
  ]);

  assert.match(runtime, /lastStartupWalletRef/);
  assert.match(
    runtime,
    /previousWallet === walletAddress[\s\S]*veinviteAppReady !== 'true'/,
  );
  assert.match(runtime, /releasedRef\.current\s*=\s*false/);
  assert.doesNotMatch(runtime, /APP_LOADING_EVENT/);
  assert.doesNotMatch(
    runtime,
    /dataset\.veinviteAppReady\s*=\s*'false'/,
  );
  assert.match(
    runtime,
    /resolveStartupReadiness\(\{[\s\S]*walletAddress:\s*walletRef\.current,[\s\S]*homeState:\s*currentHomeState/,
  );
  assert.match(
    gate,
    /if \(state === 'idle' \|\| state === 'checking'\) \{\s*return <WalletSessionBrandSurface \/>;\s*\}/,
  );
});

test('startup shield retains an explicit recovery listener without being replayed by routine wallet login', async () => {
  const [shield, runtime] = await Promise.all([
    readFile(
      new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/components/WalletRuntimeLifecycle.tsx', import.meta.url),
      'utf8',
    ),
  ]);

  assert.match(shield, /APP_LOADING_EVENT\s*=\s*'veinvite-app-loading'/);
  assert.match(shield, /const handleAppLoading = \(\) =>/);
  assert.match(shield, /released\s*=\s*false/);
  assert.match(shield, /setState\(\{ status: 'loading' \}\)/);
  assert.match(
    shield,
    /addEventListener\(\s*APP_LOADING_EVENT,\s*handleAppLoading/s,
  );
  assert.doesNotMatch(
    shield,
    /APP_READY_EVENT,\s*handleAppReady,\s*\{ once: true \}/s,
  );
  assert.doesNotMatch(runtime, /APP_LOADING_EVENT/);
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

test('wallet-session QA preview fails closed before live verification or disconnect work', async () => {
  const source = await readFile(
    new URL('../src/components/WalletSessionGate.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /WalletSessionQaState/);
  assert.match(source, /const previewMode = qaPreview !== null/);
  assert.match(
    source,
    /const verify = useCallback\(async \(\) => \{\s*if \(previewMode \|\| !walletAddress\)/s,
  );
  assert.match(
    source,
    /const disconnectFromVerification =[\s\S]*if \(previewMode \|\| isDisconnecting\)/s,
  );
  assert.match(
    source,
    /const chooseAnotherWallet =[\s\S]*if \(previewMode \|\| isDisconnecting\)/s,
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
    /onTransitionEnd=\{\(event\) => \{[\s\S]*event\.propertyName === 'opacity'[\s\S]*onExitComplete\(\)/s,
  );
  assert.match(
    source,
    /onExitComplete=\{completeAcceptedTransition\}/,
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

test('legal-consent QA preview fails closed before consent GET/POST mutation', async () => {
  const source = await readFile(
    new URL('../src/components/LegalConsentGate.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /LegalConsentQaState/);
  assert.match(source, /const previewMode = qaPreview !== null/);
  assert.match(
    source,
    /const recordConsent = useCallback\([\s\S]*if \(previewMode\) return;[\s\S]*fetch\([\s\S]*'\/api\/legal\/consent'/s,
  );
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*if \(previewMode\) return;[\s\S]*method: 'GET'/s,
  );
  assert.match(
    source,
    /const acceptCurrentDocuments =[\s\S]*if \(previewMode \|\| isAccepting \|\| isExiting\)/s,
  );
});

test('wallet/session and legal direct QA mappings cannot silently disappear', async () => {
  const coverage = await readFile(
    new URL('../src/qa/directStateCoverage.ts', import.meta.url),
    'utf8',
  );
  const renderer = await readFile(
    new URL('../src/qa/QaKnownStateRenderer.tsx', import.meta.url),
    'utf8',
  );

  for (const stateId of [
    'SESSION-IDLE-BRAND',
    'SESSION-CHECKING-DELAY',
    'SESSION-CHECKING',
    'SESSION-ERROR',
    'SESSION-WALLET-MISMATCH',
    'SESSION-DISCONNECTING',
    'LEGAL-CHECKING',
    'LEGAL-REQUIRED',
    'LEGAL-ACCEPTING',
    'LEGAL-ERROR',
  ]) {
    assert.match(
      coverage,
      new RegExp(`stateId: '${stateId}'`),
    );
  }

  assert.match(
    renderer,
    /from '@\/components\/WalletSessionGate'/,
  );
  assert.match(
    renderer,
    /from '@\/components\/LegalConsentGate'/,
  );
  assert.match(renderer, /renderer\.renderer === 'wallet-session'/);
  assert.match(renderer, /renderer\.renderer === 'legal-consent'/);
  assert.doesNotMatch(renderer, /fetch\(|supabase/i);
});
