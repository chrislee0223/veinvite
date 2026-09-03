'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useWalletLauncher } from './WalletControl';

const RETRY_MS = 120_000;
const RESERVATION_READY_EVENT =
  'veinvite-reward-reservation-ready';
const WALLET_SESSION_INVALID_EVENT =
  'veinvite-wallet-session-invalid';

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

    void retry();

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
      window.clearInterval(timer);
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      );
    };
  }, [wallet, retry]);

  return null;
}
