'use client';

import { useEffect, useRef } from 'react';
import { useWallet } from '@vechain/vechain-kit';

import {
  HOME_STARTUP_STATE_EVENT,
  readPublishedHomeStartupState,
} from '@/lib/homeStartupReadiness';
import { readPersistedDappKitAccount } from '@/lib/walletConnectionResume';

const APP_READY_EVENT = 'veinvite-app-ready';
const FRESH_VISITOR_REVEAL_MS = 350;
const WALLET_HOME_REVEAL_MS = 80;
const INTERACTIVE_WALLET_GATE_SELECTOR =
  '[data-veinvite-wallet-session-gate="interactive"]';

function normalizeWallet(value: string | null | undefined): string | null {
  return value?.trim().toLowerCase() || null;
}

function hasInteractiveWalletGate(): boolean {
  return Boolean(
    document.querySelector(INTERACTIVE_WALLET_GATE_SELECTOR),
  );
}

function hasBootstrappedSession(): boolean {
  return (
    document
      .querySelector('[data-veinvite-session-bootstrap]')
      ?.getAttribute('data-veinvite-session-bootstrap') === 'verified'
  );
}

/**
 * Initial-page acceleration only.
 *
 * Wallet changes after the app has already been revealed continue to use the
 * stricter WalletRuntimeLifecycle gate. On the very first page load, however,
 * the full-screen brand shield does not need to wait for referral/link API
 * hydration once the wallet identity is known. Home already renders safe,
 * wallet-scoped placeholders with actions disabled until server verification.
 */
export function FirstPaintStartupAccelerator() {
  const { account, connection } = useWallet();
  const walletAddress = normalizeWallet(account?.address);
  const releasedRef = useRef(false);

  useEffect(() => {
    if (
      window.location.pathname !== '/' ||
      releasedRef.current ||
      document.documentElement.dataset.veinviteAppReady === 'true'
    ) {
      return;
    }

    let revealTimer = 0;
    let revealWallet: string | null = null;

    const clearRevealTimer = () => {
      window.clearTimeout(revealTimer);
      revealTimer = 0;
      revealWallet = null;
    };

    const release = (expectedWallet: string | null) => {
      if (
        releasedRef.current ||
        document.documentElement.dataset.veinviteAppReady === 'true' ||
        hasInteractiveWalletGate()
      ) {
        return;
      }

      const currentWallet = normalizeWallet(account?.address);
      if (currentWallet !== expectedWallet) return;

      const homeState = readPublishedHomeStartupState();
      if (
        !homeState ||
        normalizeWallet(homeState.walletAddress) !== expectedWallet ||
        homeState.status === 'error'
      ) {
        return;
      }

      releasedRef.current = true;
      clearRevealTimer();
      document.documentElement.dataset.veinviteAppReady = 'true';
      window.dispatchEvent(new Event(APP_READY_EVENT));
    };

    const scheduleRelease = (
      expectedWallet: string | null,
      delay: number,
    ) => {
      if (revealTimer && revealWallet === expectedWallet) return;
      clearRevealTimer();
      revealWallet = expectedWallet;
      revealTimer = window.setTimeout(
        () => release(expectedWallet),
        delay,
      );
    };

    const evaluate = () => {
      if (
        releasedRef.current ||
        document.documentElement.dataset.veinviteAppReady === 'true'
      ) {
        clearRevealTimer();
        return;
      }

      if (hasInteractiveWalletGate()) {
        clearRevealTimer();
        return;
      }

      const homeState = readPublishedHomeStartupState();
      if (!homeState || homeState.status === 'error') {
        clearRevealTimer();
        return;
      }

      if (walletAddress) {
        if (normalizeWallet(homeState.walletAddress) !== walletAddress) {
          clearRevealTimer();
          return;
        }

        // The identity is settled. Referral/link hydration may continue inside
        // Home while the user already sees the app shell.
        scheduleRelease(walletAddress, WALLET_HOME_REVEAL_MS);
        return;
      }

      // Never flash a disconnected Home while an authenticated/persisted
      // VeWorld wallet is still restoring.
      if (
        hasBootstrappedSession() ||
        readPersistedDappKitAccount() ||
        connection?.isLoading
      ) {
        clearRevealTimer();
        return;
      }

      if (normalizeWallet(homeState.walletAddress) !== null) {
        clearRevealTimer();
        return;
      }

      // A genuinely fresh/disconnected visitor only needs the same short
      // browser settle window, not VeWorld's legacy multi-second restore wait.
      scheduleRelease(null, FRESH_VISITOR_REVEAL_MS);
    };

    evaluate();
    window.addEventListener(HOME_STARTUP_STATE_EVENT, evaluate);

    const observer = new MutationObserver(evaluate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => {
      clearRevealTimer();
      observer.disconnect();
      window.removeEventListener(HOME_STARTUP_STATE_EVENT, evaluate);
    };
  }, [account?.address, connection?.isLoading, walletAddress]);

  return (
    <style jsx global>{`
      /* First paint can now reveal while wallet-scoped Home data revalidates.
         Keep those placeholders visible instead of showing empty gaps. */
      .linkPreviewSkeleton,
      .slotsSkeleton {
        visibility: visible !important;
      }

      .slotsSkeleton {
        opacity: 0.72;
        pointer-events: none;
      }

      @media (prefers-reduced-motion: reduce) {
        .linkPreviewSkeleton::after,
        .slotSkeleton::after {
          animation: none !important;
        }
      }
    `}</style>
  );
}
