import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  resolveStartupReadiness,
  shouldHoldForWalletBootstrap,
} from '../src/lib/homeStartupReadiness.ts';

const RETURNING_WALLET =
  '0x1111111111111111111111111111111111111111';

function homeState({
  status,
  walletAddress = RETURNING_WALLET,
  invitesReady = false,
  referralLinkReady = false,
}) {
  return {
    status,
    walletAddress,
    invitesReady,
    referralLinkReady,
  };
}

function decide({
  walletAddress,
  state,
  hasBootstrappedSession = true,
  hasPersistedWallet = false,
  interactiveGateVisible = false,
}) {
  return resolveStartupReadiness({
    walletAddress,
    homeState: state,
    hasBootstrappedSession,
    hasPersistedWallet,
    interactiveGateVisible,
  });
}

test('returning VeWorld session stays covered until wallet, link, and slots are all ready', () => {
  let released = false;
  let releaseCount = 0;

  const apply = (decision) => {
    if (decision === 'release' && !released) {
      released = true;
      releaseCount += 1;
    }
  };

  let decision = decide({
    walletAddress: null,
    state: homeState({
      status: 'ready',
      walletAddress: null,
      invitesReady: true,
      referralLinkReady: true,
    }),
  });
  assert.equal(decision, 'hold');
  apply(decision);
  assert.equal(releaseCount, 0);

  decision = decide({
    walletAddress: RETURNING_WALLET,
    state: homeState({ status: 'loading' }),
  });
  assert.equal(decision, 'hold');
  apply(decision);
  assert.equal(releaseCount, 0);

  decision = decide({
    walletAddress: RETURNING_WALLET,
    state: homeState({
      status: 'loading',
      referralLinkReady: true,
      invitesReady: false,
    }),
  });
  assert.equal(decision, 'hold');
  apply(decision);
  assert.equal(releaseCount, 0);

  decision = decide({
    walletAddress: RETURNING_WALLET,
    state: homeState({
      status: 'ready',
      referralLinkReady: true,
      invitesReady: true,
    }),
  });
  assert.equal(decision, 'release');
  apply(decision);
  assert.equal(releaseCount, 1);

  apply(decision);
  assert.equal(releaseCount, 1);
});

test('wallet verification surface is temporary and can never count as final Home readiness', () => {
  assert.equal(
    decide({
      walletAddress: RETURNING_WALLET,
      state: homeState({
        status: 'ready',
        invitesReady: true,
        referralLinkReady: true,
      }),
      interactiveGateVisible: true,
    }),
    'hold',
  );

  assert.equal(
    decide({
      walletAddress: RETURNING_WALLET,
      state: homeState({
        status: 'loading',
        invitesReady: false,
        referralLinkReady: true,
      }),
      interactiveGateVisible: false,
    }),
    'hold',
  );

  assert.equal(
    decide({
      walletAddress: RETURNING_WALLET,
      state: homeState({
        status: 'ready',
        invitesReady: true,
        referralLinkReady: true,
      }),
      interactiveGateVisible: false,
    }),
    'release',
  );
});

test('Preview-origin VeWorld restore cannot be mistaken for a real anonymous visitor', () => {
  assert.equal(
    shouldHoldForWalletBootstrap({
      walletAddress: null,
      walletBootstrapSettled: false,
      interactiveGateVisible: false,
    }),
    true,
  );

  assert.equal(
    shouldHoldForWalletBootstrap({
      walletAddress: RETURNING_WALLET,
      walletBootstrapSettled: true,
      interactiveGateVisible: false,
    }),
    false,
  );
  assert.equal(
    decide({
      walletAddress: RETURNING_WALLET,
      state: homeState({
        status: 'loading',
        invitesReady: false,
        referralLinkReady: false,
      }),
      hasBootstrappedSession: false,
      hasPersistedWallet: false,
    }),
    'hold',
  );
});

test('persisted VeWorld evidence also blocks a disconnected Home during restoration', () => {
  const decision = decide({
    walletAddress: null,
    state: homeState({
      status: 'ready',
      walletAddress: null,
      invitesReady: true,
      referralLinkReady: true,
    }),
    hasBootstrappedSession: false,
    hasPersistedWallet: true,
  });

  assert.equal(decision, 'hold');
});

test('a genuine Home data failure becomes startup error instead of incomplete Home', () => {
  const decision = decide({
    walletAddress: RETURNING_WALLET,
    state: {
      ...homeState({
        status: 'error',
        referralLinkReady: true,
        invitesReady: false,
      }),
      errorMessage: 'Unable to load invitations.',
    },
  });

  assert.equal(decision, 'error');
});

test('a genuinely disconnected visitor can see the normal connect Home after wallet bootstrap settles', () => {
  assert.equal(
    shouldHoldForWalletBootstrap({
      walletAddress: null,
      walletBootstrapSettled: true,
      interactiveGateVisible: false,
    }),
    false,
  );

  const decision = decide({
    walletAddress: null,
    state: homeState({
      status: 'ready',
      walletAddress: null,
      invitesReady: true,
      referralLinkReady: true,
    }),
    hasBootstrappedSession: false,
    hasPersistedWallet: false,
  });

  assert.equal(decision, 'release');
});

test('startup runtime no longer infers Home readiness from skeleton CSS', async () => {
  const source = await readFile(
    new URL('../src/components/WalletRuntimeLifecycle.tsx', import.meta.url),
    'utf8',
  );

  assert.equal(source.includes('.slotsSkeleton'), false);
  assert.equal(source.includes('.linkPreviewSkeleton'), false);
  assert.match(source, /HOME_STARTUP_STATE_EVENT/);
});

test('VeWorld bootstrap uses SDK connection state before allowing anonymous Home', async () => {
  const source = await readFile(
    new URL('../src/components/WalletRuntimeLifecycle.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /connection\?\.isLoading/);
  assert.match(source, /connection\?\.isInAppBrowser/);
  assert.match(
    source,
    /VEWORLD_WALLET_BOOTSTRAP_SETTLE_MS\s*=\s*3_500/,
  );
  assert.match(source, /shouldHoldForWalletBootstrap/);
});

test('Home startup reveal has one owner and only the explicit wallet gate can pause it', async () => {
  const runtime = await readFile(
    new URL('../src/components/WalletRuntimeLifecycle.tsx', import.meta.url),
    'utf8',
  );
  const providers = await readFile(
    new URL('../src/components/AppProviders.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(providers, /HomeDataRevealGuard/);
  assert.match(
    runtime,
    /data-veinvite-wallet-session-gate="interactive"/,
  );
  assert.doesNotMatch(
    runtime,
    /querySelector\(\s*'\[aria-live="polite"\]'/s,
  );
});

test('interactive wallet and legal gates temporarily step the shield aside without final release', async () => {
  const shieldSource = await readFile(
    new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url),
    'utf8',
  );
  const consentSource = await readFile(
    new URL('../src/components/LegalConsentGate.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    shieldSource,
    /function hasInteractiveStartupGate\(\)/,
  );
  assert.match(
    shieldSource,
    /data-veinvite-wallet-session-gate="interactive"/,
  );
  assert.match(
    shieldSource,
    /data-veinvite-legal-consent-gate="interactive"/,
  );
  assert.match(
    consentSource,
    /data-veinvite-legal-consent-gate="interactive"/,
  );
  assert.doesNotMatch(
    shieldSource,
    /querySelector\(\s*'\[aria-live="polite"\]'/s,
  );
  assert.match(
    shieldSource,
    /new MutationObserver\(syncInteractiveGate\)/,
  );
  assert.match(
    shieldSource,
    /if \(released \|\| interactiveGateVisible\) \{\s*return;/,
  );
  assert.match(
    shieldSource,
    /if \(interactiveGateVisible\) \{[\s\S]*clearFallbackTimer\(\);[\s\S]*setShieldVisible\(false\);/,
  );
  assert.match(shieldSource, /setShieldVisible\(true\)/);
  assert.match(shieldSource, /interactiveGateVisible/);

  assert.match(
    consentSource,
    /if \(state === 'checking'\) \{\s*return <LegalConsentCheckingSurface \/>;\s*\}[\s\S]*<LegalConsentSurface/s,
  );
  assert.match(
    consentSource,
    /function LegalConsentCheckingSurface\(\)[\s\S]*<Brand compact \/>/s,
  );
});

test('referral hydration placeholders have a visual fail-safe', async () => {
  const source = await readFile(
    new URL('../src/app/globals.css', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /\.linkPreviewSkeleton,\s*\.slotsSkeleton\s*\{\s*visibility:\s*hidden\s*!important;/s,
  );
});

test('background invite changes refresh Home without restarting the wallet session', async () => {
  const poller = await readFile(
    new URL('../src/components/InviteStatusAutoRefresh.tsx', import.meta.url),
    'utf8',
  );
  const home = await readFile(
    new URL('../src/components/HomeClient.tsx', import.meta.url),
    'utf8',
  );

  assert.match(poller, /lastFingerprintRef\.current = fingerprint;/);
  assert.match(poller, /pendingRefreshRef\.current = \{ fingerprint, requestedAt: now \}/);
  assert.match(poller, /new CustomEvent\(HOME_REFRESH_REQUESTED_EVENT/);
  assert.match(poller, /HOME_REFRESH_SETTLED_EVENT/);
  assert.match(poller, /if \(detail\.success === true\) \{/);
  assert.doesNotMatch(poller, /window\.location\.reload\(\)/);
  assert.match(home, /HOME_DATA_REFRESH_REQUESTED_EVENT/);
  assert.match(home, /void load\(!manualRetry, manualRetry\)\.then/);
});

test('an actual Home load failure can be retried without losing the wallet session', async () => {
  const shield = await readFile(
    new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url),
    'utf8',
  );
  const loader = await readFile(
    new URL('../src/hooks/useHomeStartupLoader.ts', import.meta.url),
    'utf8',
  );

  assert.match(shield, /homeStatus === 'error' \|\| homeStatus === 'loading'/);
  assert.match(shield, /homeWallet/);
  assert.match(shield, /new CustomEvent\('veinvite-home-data-refresh-requested'/);
  assert.match(shield, /new Event\(APP_LOADING_EVENT\)/);
  assert.match(shield, /HOME_STARTUP_STATE_EVENT/);
  assert.match(shield, /status === 'loading' && startupErrorTimer/);
  assert.match(shield, /clearStartupErrorTimer\(\)/);
  assert.match(shield, /window\.location\.reload\(\)/);
  assert.match(loader, /if \(manualRetry\) \{/);
  assert.match(loader, /AbortSignal\.timeout\(10_000\)/);
  assert.match(loader, /startupRetryAllowedRef\.current = true/);
  assert.match(loader, /if \(inviteResponse\.status < 500\)/);
  assert.match(loader, /if \(linkResponse\.status < 500\)/);
});

test('18-second watchdog does not forcibly release an incomplete Home', async () => {
  const source = await readFile(
    new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /STARTUP_RECOVERY_MS\s*=\s*18_000/,
  );
  assert.match(
    source,
    /if \(isHome\) \{[\s\S]*setState\(\{ status: 'error' \}\);/,
  );
  assert.doesNotMatch(
    source,
    /fallbackTimer\s*=\s*window\.setTimeout\(\s*release\s*,/s,
  );
});


test('Home Retry waits through the full automatic backoff instead of flashing error', async () => {
  const [shield, loader] = await Promise.all([
    readFile(new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useHomeStartupLoader.ts', import.meta.url), 'utf8'),
  ]);
  const graceMatch = shield.match(/STARTUP_ERROR_GRACE_MS = ([\d_]+)/);
  const retryMatch = loader.match(/const retryDelays = \[([\d, ]+)\]/);
  assert.ok(graceMatch);
  assert.ok(retryMatch);
  const grace = Number(graceMatch[1].replaceAll('_', ''));
  const backoffs = retryMatch[1].split(',').map((value) => Number(value.trim()));
  assert.ok(grace > Math.max(...backoffs), 'Error screen must outlast the longest retry backoff');
  assert.match(shield, /status === 'loading' && startupErrorTimer/);
  assert.match(shield, /clearStartupErrorTimer\(\)/);
  assert.match(shield, /armFallbackTimer\(\)/);
});

test('stale overlapping Home reads cannot overwrite a newer wallet-scoped refresh', async () => {
  const loader = await readFile(
    new URL('../src/hooks/useHomeStartupLoader.ts', import.meta.url),
    'utf8',
  );
  assert.match(loader, /const requestGenerationRef = useRef\(0\)/);
  assert.match(loader, /const requestGeneration = \+\+requestGenerationRef\.current/);
  assert.match(loader, /const isCurrentRequest = \(\) =>[\s\S]*sameWallet\(activeWalletRef\.current, requestWallet\)[\s\S]*requestGenerationRef\.current === requestGeneration/);
  assert.match(loader, /if \(!isCurrentRequest\(\)\) return false;/);
  assert.match(loader, /if \(!quiet && isCurrentRequest\(\)\)/);
  assert.match(loader, /if \(inviteResponse\.status < 500\)/);
  assert.match(loader, /if \(linkResponse\.status < 500\)/);
});

test('background invite polling and Home preferences fail safely on slow or restricted browsers', async () => {
  const [poller, home] = await Promise.all([
    readFile(new URL('../src/components/InviteStatusAutoRefresh.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/HomeClient.tsx', import.meta.url), 'utf8'),
  ]);
  assert.equal((poller.match(/signal: AbortSignal\.timeout\(10_000\)/g) ?? []).length, 1);
  assert.match(home, /try \{[\s\S]*window\.localStorage\.getItem\(LANGUAGE_STORAGE_KEY\)[\s\S]*\} catch \{/);
  assert.match(home, /try \{[\s\S]*window\.sessionStorage\.getItem\([\s\S]*\} catch \{/);
  assert.match(home, /window\.localStorage\.setItem\(LANGUAGE_STORAGE_KEY, nextLocale\)/);
});


test('silent Home polling cannot replace the authoritative startup or create overlapping reads', async () => {
  const loader = await readFile(
    new URL('../src/hooks/useHomeStartupLoader.ts', import.meta.url),
    'utf8',
  );
  const home = await readFile(
    new URL('../src/components/HomeClient.tsx', import.meta.url),
    'utf8',
  );
  assert.match(loader, /homeReadyRef\.current = invitesReady && referralLinkVerified/);
  assert.match(loader, /if \(quiet && !homeReadyRef\.current\) return false/);
  assert.match(loader, /if \(quiet && activeRequestRef\.current !== null\)/);
  assert.match(loader, /deferredQuietRefreshRef\.current = true/);
  assert.match(loader, /activeRequestRef\.current === requestGeneration/);
  assert.match(loader, /const requestGeneration = \+\+requestGenerationRef\.current/);
  assert.match(loader, /requestGenerationRef\.current === requestGeneration/);
  assert.match(loader, /return invitesSucceeded && linkSucceeded && isCurrentRequest\(\)/);
  assert.match(home, /load\(!manualRetry, manualRetry\)\.then\(\(success\) =>/);
  assert.match(home, /HOME_DATA_REFRESH_SETTLED_EVENT/);
  assert.match(home, /fingerprint: detail\.fingerprint/);
  assert.match(home, /success,/);
});

test('failed invite refresh stays pending for a later retry and wallet switches do not steal the check lock', async () => {
  const poller = await readFile(
    new URL('../src/components/InviteStatusAutoRefresh.tsx', import.meta.url),
    'utf8',
  );
  assert.match(poller, /REFRESH_ACK_TIMEOUT_MS = 45_000/);
  assert.match(poller, /pending\?\.fingerprint === fingerprint/);
  assert.match(poller, /now - pending\.requestedAt < REFRESH_ACK_TIMEOUT_MS/);
  assert.match(poller, /pendingRefreshRef\.current = null/);
  assert.match(poller, /if \(detail\.success === true\) \{[\s\S]*lastFingerprintRef\.current = pending\.fingerprint/);
  assert.match(poller, /checkingRef\.current === walletAddress/);
  assert.match(poller, /if \(checkingRef\.current === requestWallet\) \{[\s\S]*checkingRef\.current = null/);
});


test('only HomeClient can initiate payout-capable invite reconciliation, with bounded serialized attempts', async () => {
  const [home, observer, loader] = await Promise.all([
    readFile(new URL('../src/components/HomeClient.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/InviteStatusAutoRefresh.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useHomeStartupLoader.ts', import.meta.url), 'utf8'),
  ]);

  // Passive 30-second observer must not POST evidence or trigger rewards.
  assert.match(observer, /\/api\/invites\?inviter=/);
  assert.doesNotMatch(observer, /method:\s*'POST'/);
  assert.doesNotMatch(observer, /EVIDENCE_SYNC_INTERVAL_MS|lastEvidenceSyncRef|evidenceSyncCandidate/);
  assert.match(observer, /new CustomEvent\(HOME_REFRESH_REQUESTED_EVENT/);

  // The two Home referral slots are reconciled sequentially, never in parallel.
  assert.match(home, /for \(const invite of dueInvites\)/);
  assert.match(home, /acceptedActiveInvites\.slice\(0, 2\)/);
  assert.match(home, /evidenceSyncAttemptRef\.current\.set\(key, Date\.now\(\)\)/);
  assert.match(home, /Date\.now\(\) - previous >= EVIDENCE_REFRESH_MS/);
  assert.match(home, /signal: AbortSignal\.timeout\(15_000\)/);
  assert.match(home, /credentials: 'same-origin'/);
  assert.match(home, /if \(response\.ok\) hasSuccessfulSync = true/);
  assert.match(home, /hasSuccessfulSync &&[\s\S]*sameWallet\(activeWalletRef\.current, requestWallet\)/);
  assert.doesNotMatch(home, /Promise\.allSettled\(\s*acceptedActiveInvites/);

  // Timed-out browser requests can continue on the server; never retry in a tight loop.
  assert.match(home, /const evidenceSyncAttemptRef = useRef<Map<string, number>>\(new Map\(\)\)/);
  assert.match(home, /evidenceSyncAttemptRef\.current\.get\(key\)/);
  assert.match(loader, /if \(!sameWallet\(activeWalletRef\.current, wallet\)\) return false/);
  assert.match(home, /activeWalletRef\.current = wallet;/);
});

test('Home evidence sync respects existing payout authorization and cannot change reward policy', async () => {
  const endpoint = await readFile(
    new URL('../src/app/api/invites/[code]/route.ts', import.meta.url),
    'utf8',
  );
  assert.match(endpoint, /const session = await requireWalletSession\(\{ request \}\)/);
  assert.match(endpoint, /if \(!sessionOwnsReferral\)/);
  assert.match(endpoint, /await enforceInviteRateLimit\(/);
  assert.match(endpoint, /await syncInvitationEvidence\(current\)/);
  assert.match(endpoint, /await runAutomaticRewardPayout\(\)/);
});
