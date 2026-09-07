'use client';

import { useEffect } from 'react';
import { useWallet } from '@vechain/vechain-kit';

const WALLET_SESSION_READY_EVENT =
  'veinvite-wallet-session-ready';

type SessionResponse = {
  authenticated?: boolean;
  walletAddress?: string;
};

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
        syncStarted = false;
        console.warn(
          'Failed to record VeInvite wallet country observation:',
          error,
        );
      }
    };

    const handleWalletSessionReady = () => {
      void syncCountry();
    };

    window.addEventListener(
      WALLET_SESSION_READY_EVENT,
      handleWalletSessionReady,
    );

    void (async () => {
      try {
        const response = await fetch(
          '/api/auth/session',
          { cache: 'no-store' },
        );
        const body =
          (await response.json()) as SessionResponse;
        const sessionWallet =
          body.walletAddress?.toLowerCase();

        if (
          response.ok &&
          body.authenticated === true &&
          sessionWallet === walletAddress
        ) {
          await syncCountry();
        }
      } catch {
        // Wallet verification may still be in progress. WalletSessionGate will
        // publish the ready event after verification succeeds.
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener(
        WALLET_SESSION_READY_EVENT,
        handleWalletSessionReady,
      );
    };
  }, [walletAddress]);

  return null;
}
