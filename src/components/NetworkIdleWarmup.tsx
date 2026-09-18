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
    let dataStarted = false;
    let modulesStarted = false;
    let modulesScheduled = false;
    let idleId: number | null = null;
    let timeoutId = 0;

    const warmData = () => {
      if (
        !active ||
        dataStarted ||
        document.visibilityState !== 'visible'
      ) {
        return;
      }

      dataStarted = true;
      const rootWarmup = prefetchNetworkRoot(wallet).then((root) => {
        // The complete root already contains the empty/non-empty Network
        // summary. Reuse it instead of issuing a duplicate summary request.
        rememberNetworkSummary(wallet, {
          summary: { network: root.summary.network },
        });
        return root;
      });

      // Data requests start as soon as authenticated Home is ready. They are
      // read-only and network-bound, so waiting for browser idle only makes
      // Network entry more likely to expose staggered late data.
      void Promise.allSettled([
        rootWarmup,
        prefetchNetworkSlots(wallet),
      ]);
    };

    const warmModules = () => {
      modulesScheduled = false;
      idleId = null;
      timeoutId = 0;

      if (
        !active ||
        modulesStarted ||
        document.visibilityState !== 'visible'
      ) {
        return;
      }

      modulesStarted = true;
      void Promise.allSettled([
        import('./AppGuide'),
        import('./AppNetworkHub'),
      ]);
    };

    const scheduleModules = () => {
      if (!active || modulesStarted || modulesScheduled) return;
      modulesScheduled = true;

      const idleWindow = window as IdleWindow;
      if (idleWindow.requestIdleCallback) {
        idleId = idleWindow.requestIdleCallback(
          warmModules,
          { timeout: NETWORK_IDLE_TIMEOUT_MS },
        );
        return;
      }

      timeoutId = window.setTimeout(
        warmModules,
        NETWORK_TIMEOUT_FALLBACK_MS,
      );
    };

    const warmWhenReadyAndVisible = () => {
      if (
        document.visibilityState !== 'visible' ||
        document.documentElement.dataset.veinviteAppReady !== 'true'
      ) {
        return;
      }

      warmData();
      scheduleModules();
    };

    if (
      document.documentElement.dataset.veinviteAppReady === 'true'
    ) {
      warmWhenReadyAndVisible();
    } else {
      window.addEventListener(
        APP_READY_EVENT,
        warmWhenReadyAndVisible,
        { once: true },
      );
    }

    document.addEventListener(
      'visibilitychange',
      warmWhenReadyAndVisible,
    );

    return () => {
      active = false;
      window.removeEventListener(
        APP_READY_EVENT,
        warmWhenReadyAndVisible,
      );
      document.removeEventListener(
        'visibilitychange',
        warmWhenReadyAndVisible,
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
