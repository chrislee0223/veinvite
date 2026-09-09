'use client';

import { useEffect } from 'react';
import { useWallet } from '@vechain/vechain-kit';

const APP_READY_EVENT = 'veinvite-app-ready';
const WALLET_SESSION_READY_EVENT =
  'veinvite-wallet-session-ready';

async function recordCountry(): Promise<void> {
  const response = await fetch(
    '/api/preferences/country',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{}',
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
        await recordCountry();
      } catch (error) {
        // The component can mount before the authenticated cookie is ready.
        // Reset the guard so wallet-session-ready can retry immediately.
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

    // Works on /, /i/* and /r/* alike. Existing sessions that predate trusted
    // country capture are progressively repaired when they next visit.
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
