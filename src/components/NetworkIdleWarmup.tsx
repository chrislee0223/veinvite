'use client';

import { useEffect } from 'react';

import { prefetchNetworkRoot } from '@/lib/networkRootClientCache';
import { rememberNetworkSummary } from '@/lib/networkSummaryClientCache';
import { prefetchNetworkSlots } from '@/lib/networkSlotsClientCache';
import { useWalletLauncher } from './WalletControl';

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const APP_READY_EVENT = 'veinvite-app-ready';
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
      const moduleLoads: Promise<unknown>[] = [
        import('./AppGuide'),
        import('./AppNetworkHub'),
      ];

      const rootWarmup = prefetchNetworkRoot(wallet).then((root) => {
        // The complete root already contains the empty/non-empty Network
        // summary. Reuse it instead of issuing a separate summary request.
        rememberNetworkSummary(wallet, {
          summary: { network: root.summary.network },
        });
        return root;
      });

      void Promise.allSettled([
        rootWarmup,
        prefetchNetworkSlots(wallet),
        ...moduleLoads,
      ]);

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
