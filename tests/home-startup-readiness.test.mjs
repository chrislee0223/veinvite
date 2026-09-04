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

test('wallet verification temporarily steps the shield aside without final release', async () => {
  const source = await readFile(
    new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /function hasInteractiveWalletGate\(\)/);
  assert.match(
    source,
    /data-veinvite-wallet-session-gate="interactive"/,
  );
  assert.doesNotMatch(
    source,
    /querySelector\(\s*'\[aria-live="polite"\]'/s,
  );
  assert.match(source, /new MutationObserver\(syncInteractiveGate\)/);
  assert.match(source, /setShieldVisible\(false\)/);
  assert.match(source, /setShieldVisible\(true\)/);
  assert.match(source, /interactiveGateVisible/);
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

test('8-second watchdog does not forcibly release an incomplete Home', async () => {
  const source = await readFile(
    new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /STARTUP_RECOVERY_MS\s*=\s*8_000/,
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
