'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useWallet } from '@vechain/vechain-kit';

import { Brand } from '@/components/Brand';

const WALLET_SESSION_READY_EVENT =
  'veinvite-wallet-session-ready';
const WALLET_SESSION_CLEARED_EVENT =
  'veinvite-wallet-session-cleared';
const WALLET_SWITCH_SHIELD_MAX_MS = 5_000;
const SESSION_BOOTSTRAP_SELECTOR =
  '[data-veinvite-session-bootstrap]';

type BootstrapSessionMarker = {
  status: 'verified' | 'none';
  wallet: string | null;
};

function readBootstrapSessionMarker(): BootstrapSessionMarker {
  const marker = document.querySelector<HTMLElement>(
    SESSION_BOOTSTRAP_SELECTOR,
  );
  const status =
    marker?.getAttribute(
      'data-veinvite-session-bootstrap',
    ) === 'verified'
      ? 'verified'
      : 'none';
  const rawWallet = marker?.getAttribute(
    'data-veinvite-session-wallet',
  );
  const wallet = rawWallet?.trim().toLowerCase() || null;

  return { status, wallet };
}

function writeBootstrapSessionMarker(
  status: BootstrapSessionMarker['status'],
  wallet: string | null,
) {
  const marker = document.querySelector<HTMLElement>(
    SESSION_BOOTSTRAP_SELECTOR,
  );

  if (!marker) {
    return;
  }

  marker.setAttribute(
    'data-veinvite-session-bootstrap',
    status,
  );
  marker.setAttribute(
    'data-veinvite-session-wallet',
    wallet ?? '',
  );
}

/**
 * WalletSessionGate remains the authority for authentication and errors. This
 * shield only keeps the already-reviewed VeInvite brand surface visually stable
 * while a real VeWorld account switch moves from the old browser session to the
 * new provider wallet. It never grants access, clears sessions, or signs.
 */
export function WalletSessionTransitionShield() {
  const { account } = useWallet();
  const walletAddress =
    account?.address?.trim().toLowerCase() ?? null;
  const walletAddressRef = useRef<string | null>(walletAddress);
  const [marker, setMarker] =
    useState<BootstrapSessionMarker>({
      status: 'none',
      wallet: null,
    });
  const [timedOutPair, setTimedOutPair] =
    useState<string | null>(null);

  useEffect(() => {
    walletAddressRef.current = walletAddress;
  }, [walletAddress]);

  useEffect(() => {
    const syncMarker = () => {
      setMarker(readBootstrapSessionMarker());
    };
    const handleSessionReady = () => {
      const currentWallet = walletAddressRef.current;
      if (currentWallet) {
        writeBootstrapSessionMarker(
          'verified',
          currentWallet,
        );
      }
      syncMarker();
    };
    const handleSessionCleared = () => {
      writeBootstrapSessionMarker('none', null);
      syncMarker();
    };

    syncMarker();

    const markerElement =
      document.querySelector<HTMLElement>(
        SESSION_BOOTSTRAP_SELECTOR,
      );
    const observer = markerElement
      ? new MutationObserver(syncMarker)
      : null;
    observer?.observe(markerElement, {
      attributes: true,
      attributeFilter: [
        'data-veinvite-session-bootstrap',
        'data-veinvite-session-wallet',
      ],
    });

    window.addEventListener(
      WALLET_SESSION_READY_EVENT,
      handleSessionReady,
    );
    window.addEventListener(
      WALLET_SESSION_CLEARED_EVENT,
      handleSessionCleared,
    );

    return () => {
      observer?.disconnect();
      window.removeEventListener(
        WALLET_SESSION_READY_EVENT,
        handleSessionReady,
      );
      window.removeEventListener(
        WALLET_SESSION_CLEARED_EVENT,
        handleSessionCleared,
      );
    };
  }, []);

  const mismatchPair =
    marker.status === 'verified' &&
    marker.wallet &&
    walletAddress &&
    marker.wallet !== walletAddress
      ? `${marker.wallet}:${walletAddress}`
      : null;

  useEffect(() => {
    if (!mismatchPair) {
      setTimedOutPair(null);
      return;
    }

    if (timedOutPair === mismatchPair) {
      return;
    }

    const timer = window.setTimeout(() => {
      setTimedOutPair(mismatchPair);
    }, WALLET_SWITCH_SHIELD_MAX_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [mismatchPair, timedOutPair]);

  if (
    !mismatchPair ||
    timedOutPair === mismatchPair
  ) {
    return null;
  }

  return (
    <div
      data-veinvite-wallet-switch-shield="true"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
        background:
          'radial-gradient(circle at 50% 38%, rgba(244,183,40,0.10), transparent 32%), #080807',
      }}
    >
      <Brand compact />
    </div>
  );
}
