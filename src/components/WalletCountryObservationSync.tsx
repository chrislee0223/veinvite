'use client';

import { useEffect } from 'react';
import { useWallet } from '@vechain/vechain-kit';

const APP_READY_EVENT = 'veinvite-app-ready';

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

    const isCurrentWalletAppReady = () =>
      document.documentElement.dataset.veinviteAppReady === 'true' &&
      document.documentElement.dataset.veinviteHomeStartupStatus === 'ready' &&
      document.documentElement.dataset.veinviteHomeStartupWallet?.toLowerCase() ===
        walletAddress;

    const syncCountry = async () => {
      if (cancelled || syncStarted || !isCurrentWalletAppReady()) return;
      syncStarted = true;

      try {
        await recordCountry();
      } catch (error) {
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

    window.addEventListener(
      APP_READY_EVENT,
      handleAppReady,
    );

    if (isCurrentWalletAppReady()) {
      void syncCountry();
    }

    return () => {
      cancelled = true;
      window.removeEventListener(
        APP_READY_EVENT,
        handleAppReady,
      );
    };
  }, [walletAddress]);

  return null;
}
