'use client';

import { useEffect } from 'react';
import { useWallet } from '@vechain/vechain-kit';

const APP_READY_EVENT = 'veinvite-app-ready';
const WALLET_SESSION_READY_EVENT =
  'veinvite-wallet-session-ready';

type SessionResponse = {
  authenticated?: boolean;
  walletAddress?: string;
};

async function hasCurrentWalletSession(
  expectedWallet: string,
): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/session', {
      credentials: 'include',
      cache: 'no-store',
    });
    const body =
      (await response.json().catch(() => ({}))) as SessionResponse;

    return (
      response.ok &&
      body.authenticated === true &&
      body.walletAddress?.toLowerCase() === expectedWallet
    );
  } catch {
    return false;
  }
}

async function recordCountry(
  expectedWallet: string,
): Promise<void> {
  const response = await fetch(
    '/api/preferences/country',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expectedWallet }),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      body.error || 'Country observation save failed.',
    );
  }
}

export function WalletCountryObservationSync() {
  const { account } = useWallet();
  const walletAddress =
    account?.address?.toLowerCase() ?? null;

  useEffect(() => {
    if (!walletAddress) return;

    let cancelled = false;
    let syncStarted = false;

    const syncCountry = async () => {
      if (cancelled || syncStarted) return;
      syncStarted = true;

      try {
        // VeChainKit can publish a new provider account before VeInvite has
        // finished issuing that wallet's authenticated cookie. Probe the
        // read-only session endpoint first so the protected country mutation
        // never runs during that transition window.
        const sessionReady =
          await hasCurrentWalletSession(walletAddress);

        if (!sessionReady) {
          syncStarted = false;
          return;
        }

        if (cancelled) {
          return;
        }

        await recordCountry(walletAddress);
      } catch (error) {
        if (cancelled) return;
        syncStarted = false;
        console.warn(
          'Failed to record VeInvite wallet country observation:',
          error,
        );
      }
    };

    const handleAppReady = () => {
      void syncCountry();
    };
    const handleWalletSessionReady = () => {
      void syncCountry();
    };

    window.addEventListener(
      APP_READY_EVENT,
      handleAppReady,
    );
    window.addEventListener(
      WALLET_SESSION_READY_EVENT,
      handleWalletSessionReady,
    );

    // Existing authenticated sessions on /i/* and /r/* are still repaired on
    // entry, but first-login flows only touch the protected country endpoint
    // after the active wallet owns the VeInvite session.
    void syncCountry();

    return () => {
      cancelled = true;
      window.removeEventListener(
        APP_READY_EVENT,
        handleAppReady,
      );
      window.removeEventListener(
        WALLET_SESSION_READY_EVENT,
        handleWalletSessionReady,
      );
    };
  }, [walletAddress]);

  return null;
}
