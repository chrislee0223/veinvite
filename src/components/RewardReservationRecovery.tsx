'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useWalletLauncher } from './WalletControl';

const RETRY_MS = 120_000;
const IDLE_TIMEOUT_MS = 1_500;
const APP_READY_EVENT = 'veinvite-app-ready';
const RESERVATION_READY_EVENT =
  'veinvite-reward-reservation-ready';
const WALLET_SESSION_INVALID_EVENT =
  'veinvite-wallet-session-invalid';

type IdleCapableWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (id: number) => void;
};

function normalizeWallet(
  wallet: string | null | undefined,
): string | null {
  return wallet?.trim().toLowerCase() ?? null;
}

function isCurrentWalletAppReady(wallet: string): boolean {
  const root = document.documentElement.dataset;

  return (
    root.veinviteAppReady === 'true' &&
    root.veinviteHomeStartupStatus === 'ready' &&
    normalizeWallet(root.veinviteHomeStartupWallet) ===
      normalizeWallet(wallet)
  );
}

/**
 * A referral can complete a few blocks before its completion position becomes
 * finalized. The completion remains in its original friend slot until the
 * fixed reward reservation is durable. This tiny authenticated heartbeat
 * retries only while the user's own completed referral is waiting for that
 * finality transition, avoiding a daily-cron-sized delay in slot reuse.
 */
export function RewardReservationRecovery() {
  const { wallet } = useWalletLauncher();
  const runningRef = useRef(false);
  const walletRef = useRef<string | null>(
    normalizeWallet(wallet),
  );

  useEffect(() => {
    walletRef.current = normalizeWallet(wallet);
  }, [wallet]);

  const retry = useCallback(async () => {
    const requestWallet = normalizeWallet(wallet);

    if (
      !requestWallet ||
      runningRef.current ||
      document.visibilityState !== 'visible' ||
      !isCurrentWalletAppReady(requestWallet)
    ) {
      return;
    }

    runningRef.current = true;
    try {
      const response = await fetch(
        '/api/rewards/reservations/retry',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          cache: 'no-store',
        },
      );

      // Ignore a late response from wallet A after the provider has already
      // switched to wallet B. The server remains authoritative, but stale A
      // must not re-arm B's session gate or refresh B's reward UI.
      if (walletRef.current !== requestWallet) {
        return;
      }

      if (response.status === 401) {
        window.dispatchEvent(
          new Event(WALLET_SESSION_INVALID_EVENT),
        );
        return;
      }

      if (!response.ok) return;

      const body = (await response.json()) as {
        ready?: boolean;
      };

      if (
        body.ready === true &&
        walletRef.current === requestWallet
      ) {
        window.dispatchEvent(
          new Event(RESERVATION_READY_EVENT),
        );
      }
    } catch (error) {
      console.warn(
        'VeInvite reward finality retry failed:',
        error,
      );
    } finally {
      runningRef.current = false;
    }
  }, [wallet]);

  useEffect(() => {
    if (!wallet) return;

    const idleWindow = window as IdleCapableWindow;
    let initialStarted = false;
    let idleId: number | null = null;
    let idleFallbackId = 0;

    const startInitialRetry = () => {
      if (initialStarted) return;
      initialStarted = true;
      void retry();
    };

    const scheduleInitialRetry = () => {
      if (
        initialStarted ||
        idleId !== null ||
        idleFallbackId !== 0 ||
        !isCurrentWalletAppReady(wallet)
      ) {
        return;
      }

      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleId = idleWindow.requestIdleCallback(
          () => {
            idleId = null;
            startInitialRetry();
          },
          { timeout: IDLE_TIMEOUT_MS },
        );
        return;
      }

      idleFallbackId = window.setTimeout(() => {
        idleFallbackId = 0;
        startInitialRetry();
      }, IDLE_TIMEOUT_MS);
    };

    if (isCurrentWalletAppReady(wallet)) {
      scheduleInitialRetry();
    }

    // Keep listening until this wallet really becomes ready. A generic timeout
    // must never bypass wallet verification just to run a protected heartbeat.
    window.addEventListener(
      APP_READY_EVENT,
      scheduleInitialRetry,
    );

    const timer = window.setInterval(
      () => void retry(),
      RETRY_MS,
    );
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void retry();
      }
    };

    document.addEventListener(
      'visibilitychange',
      onVisibilityChange,
    );

    return () => {
      window.removeEventListener(
        APP_READY_EVENT,
        scheduleInitialRetry,
      );
      window.clearTimeout(idleFallbackId);
      if (idleId !== null && idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(idleId);
      }
      window.clearInterval(timer);
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      );
    };
  }, [wallet, retry]);

  return null;
}
