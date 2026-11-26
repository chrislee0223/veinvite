'use client';

import { useEffect } from 'react';
import { useWallet } from '@vechain/vechain-kit';

import { hasCurrentWalletSession } from '@/lib/walletSessionClientProbe';

const APP_READY_EVENT = 'veinvite-app-ready';
const WALLET_SESSION_READY_EVENT =
  'veinvite-wallet-session-ready';

async function recordCountry(
  expectedWallet: string,
): Promise<boolean> {
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
  const body = await response.json() as { recorded?: unknown };
  return body.recorded === true;
}

export function WalletCountryObservationSync() {
  const { account } = useWallet();
  const walletAddress =
    account?.address?.toLowerCase() ?? null;

  useEffect(() => {
    if (!walletAddress) return;

    let cancelled = false;
    let syncStarted = false;
    let inFlight = false;
    let queued = false;

    const syncCountry = async () => {
      if (cancelled) return;
      if (inFlight) {
        queued = true;
        return;
      }
      if (syncStarted) return;
      inFlight = true;
      syncStarted = true;

      try {
        const sessionReady =
          await hasCurrentWalletSession(walletAddress);

        if (!sessionReady) {
          syncStarted = false;
          return;
        }

        if (cancelled) {
          return;
        }

        // A missing/invalid edge country is not a successful observation.
        // Retry on a later visible re-entry; never poll in the background.
        syncStarted = await recordCountry(walletAddress);
      } catch (error) {
        if (cancelled) return;
        syncStarted = false;
        console.warn(
          'Failed to record VeInvite wallet country observation:',
          error,
        );
      } finally {
        inFlight = false;
        const retry = queued && !cancelled && !syncStarted;
        queued = false;
        if (retry) void syncCountry();
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

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void syncCountry();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Re-entry may restore the authenticated cookie before the wallet-ready
    // event is observed. The shared probe coalesces this check with language
    // sync instead of issuing a second identical session request.
    void syncCountry();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
