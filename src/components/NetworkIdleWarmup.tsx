'use client';

import { useEffect } from 'react';

import { prefetchNetworkSummary } from '@/lib/networkSummaryClientCache';
import { useWalletLauncher } from './WalletControl';

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const APP_READY_EVENT = 'veinvite-app-ready';
const NETWORK_CANARY_WALLET =
  '0xeff325935b63299e9eeda79931bed6ec119aefcb';
const NETWORK_IDLE_TIMEOUT_MS = 900;
const NETWORK_TIMEOUT_FALLBACK_MS = 240;

export function NetworkIdleWarmup() {
  const { wallet } = useWalletLauncher();

  useEffect(() => {
    if (
      !wallet ||
      process.env.NEXT_PUBLIC_NETWORK_CANVAS_ENABLED === 'false' ||
      window.location.pathname !== '/'
    ) {
      return;
    }

    let active = true;
    let started = false;
    let scheduled = false;
    let idleId: number | null = null;
    let timeoutId = 0;

    const warm = () => {
      if (
        !active ||
        started ||
        document.visibilityState !== 'visible'
      ) {
        return;
      }

      started = true;
      const normalizedWallet = wallet.toLowerCase();
      const moduleLoads: Promise<unknown>[] = [
        import('./AppGuide'),
      ];

      if (normalizedWallet === NETWORK_CANARY_WALLET) {
        moduleLoads.push(import('./AppNetworkCanaryV71'));
      } else {
        moduleLoads.push(import('./AppNetworkHub'));
        void prefetchNetworkSummary(wallet).catch(() => {
          // Best-effort warmup only. AppNetworkHub owns visible retry/error UX.
        });
      }

      void Promise.allSettled(moduleLoads);
    };

    const runWarmup = () => {
      scheduled = false;
      idleId = null;
      timeoutId = 0;
      warm();
    };

    const scheduleWarmup = () => {
      if (!active || started || scheduled) return;
      scheduled = true;

      const idleWindow = window as IdleWindow;
      if (idleWindow.requestIdleCallback) {
        idleId = idleWindow.requestIdleCallback(
          runWarmup,
          { timeout: NETWORK_IDLE_TIMEOUT_MS },
        );
        return;
      }

      timeoutId = window.setTimeout(
        runWarmup,
        NETWORK_TIMEOUT_FALLBACK_MS,
      );
    };

    const scheduleWhenVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        document.documentElement.dataset.veinviteAppReady === 'true'
      ) {
        scheduleWarmup();
      }
    };

    if (
      document.documentElement.dataset.veinviteAppReady === 'true'
    ) {
      scheduleWarmup();
    } else {
      window.addEventListener(
        APP_READY_EVENT,
        scheduleWarmup,
        { once: true },
      );
    }

    document.addEventListener(
      'visibilitychange',
      scheduleWhenVisible,
    );

    return () => {
      active = false;
      window.removeEventListener(
        APP_READY_EVENT,
        scheduleWarmup,
      );
      document.removeEventListener(
        'visibilitychange',
        scheduleWhenVisible,
      );

      const idleWindow = window as IdleWindow;
      if (idleId !== null && idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(idleId);
      }
      window.clearTimeout(timeoutId);
    };
  }, [wallet]);

  return null;
}
