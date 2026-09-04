'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@vechain/vechain-kit';

import { Brand } from './Brand';
import {
  HOME_STARTUP_STATE_EVENT,
  readPublishedHomeStartupState,
  type HomeStartupState,
} from '@/lib/homeStartupReadiness';

function normalizeWallet(
  value: string | null | undefined,
): string | null {
  return value?.trim().toLowerCase() || null;
}

export function HomeDataRevealGuard() {
  const { account } = useWallet();
  const walletAddress = normalizeWallet(account?.address);
  const [homeState, setHomeState] = useState<HomeStartupState | null>(null);

  useEffect(() => {
    setHomeState(readPublishedHomeStartupState());

    const handleHomeStartupState = (event: Event) => {
      const detail =
        (event as CustomEvent<HomeStartupState>).detail;
      if (detail) {
        setHomeState(detail);
      }
    };

    window.addEventListener(
      HOME_STARTUP_STATE_EVENT,
      handleHomeStartupState,
    );

    return () => {
      window.removeEventListener(
        HOME_STARTUP_STATE_EVENT,
        handleHomeStartupState,
      );
    };
  }, []);

  if (
    typeof window === 'undefined' ||
    window.location.pathname !== '/' ||
    !walletAddress ||
    !homeState ||
    normalizeWallet(homeState.walletAddress) !== walletAddress ||
    homeState.status !== 'loading' ||
    (homeState.invitesReady && homeState.referralLinkReady)
  ) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(circle at 50% 38%, rgba(244,183,40,0.10), transparent 32%), #080807',
        pointerEvents: 'none',
      }}
    >
      <Brand compact />
    </div>
  );
}
