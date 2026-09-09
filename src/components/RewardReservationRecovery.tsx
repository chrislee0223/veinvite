'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useWalletLauncher } from './WalletControl';

const RETRY_MS = 120_000;
const STARTUP_FALLBACK_MS = 5_000;
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

  const retry = useCallback(async () => {
    if (
      !wallet ||
      runningRef.current ||
      document.visibilityState !== 'visible'
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

      if (body.ready === true) {
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
    let startupFallbackId = 0;

    const startInitialRetry = () => {
      if (initialStarted) return;
      initialStarted = true;
      window.clearTimeout(startupFallbackId);
      void retry();
    };

    const scheduleInitialRetry = () => {
      if (initialStarted || idleId !== null || idleFallbackId !== 0) {
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

    if (
      document.documentElement.dataset.veinviteAppReady === 'true'
    ) {
      scheduleInitialRetry();
    } else {
      window.addEventListener(
        APP_READY_EVENT,
        scheduleInitialRetry,
        { once: true },
      );
      // Keep the recovery heartbeat resilient even if startup readiness never
      // publishes because another surface is waiting for user action.
      startupFallbackId = window.setTimeout(
        scheduleInitialRetry,
        STARTUP_FALLBACK_MS,
      );
    }

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
      window.clearTimeout(startupFallbackId);
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
