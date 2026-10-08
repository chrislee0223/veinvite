'use client';

import { useEffect } from 'react';
import { useWallet } from '@vechain/vechain-kit';

const APP_READY_EVENT = 'veinvite-app-ready';
const WALLET_SESSION_READY_EVENT =
  'veinvite-wallet-session-ready';

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
        // The protected endpoint remains authoritative and binds the write to
        // expectedWallet. This effect only starts after VeInvite publishes a
        // verified session/app-ready signal, so a separate session probe would
        // duplicate the same server validation during startup.
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
