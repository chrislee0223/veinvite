import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  resolveStartupReadiness,
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

  // SSR already knows this browser has a valid VeInvite session, but VeWorld
  // has not restored the provider account yet. The disconnected Home may mount
  // underneath the shield; it must never become visible.
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

  // VeWorld restores the same wallet later. Home immediately resets its wallet-
  // scoped data and reports loading, so the startup surface must remain.
  decision = decide({
    walletAddress: RETURNING_WALLET,
    state: homeState({ status: 'loading' }),
  });
  assert.equal(decision, 'hold');
  apply(decision);
  assert.equal(releaseCount, 0);

  // The permanent referral link arrives first. Slots are still unresolved.
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

  // Only the final combined Home state may release the application.
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

  // Duplicate ready notifications are harmless: the runtime release is one-shot.
  apply(decision);
  assert.equal(releaseCount, 1);
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

test('a genuinely disconnected visitor can see the normal connect Home', () => {
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
    /if \(isHome\) \{\s*setState\(\{ status: 'error' \}\);/s,
  );
  assert.doesNotMatch(
    source,
    /fallbackTimer\s*=\s*window\.setTimeout\(\s*release\s*,/s,
  );
});
