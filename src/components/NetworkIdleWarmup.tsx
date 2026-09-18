'use client';

import { useEffect } from 'react';

import {
  prefetchEnrichedNetworkRoot,
  prefetchNetworkRoot,
} from '@/lib/networkRootClientCache';
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
const WALLET_SESSION_READY_EVENT = 'veinvite-wallet-session-ready';
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
    let sessionReadyObserved = false;
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
      void prefetchNetworkSummary(wallet).catch(() => null);
      void prefetchNetworkRoot(wallet)
        .catch(() => null)
        .then(() => {
          if (!active) return;
          void prefetchEnrichedNetworkRoot(wallet, { force: true })
            .catch(() => null);
        });
    };

    const warmModules = () => {
      if (!active || modulesStarted || document.visibilityState !== 'visible') return;
      modulesStarted = true;
      void Promise.allSettled([
        import('./AppGuide'),
        import('./AppNetworkHub'),
      ]);
    };

    const runModuleWarmup = () => {
      modulesScheduled = false;
      idleId = null;
      timeoutId = 0;
      warmModules();
    };

    const scheduleModuleWarmup = () => {
      if (!active || modulesStarted || modulesScheduled) return;
      modulesScheduled = true;

      const idleWindow = window as IdleWindow;
      if (idleWindow.requestIdleCallback) {
        idleId = idleWindow.requestIdleCallback(
          runModuleWarmup,
          { timeout: NETWORK_IDLE_TIMEOUT_MS },
        );
        return;
      }

      timeoutId = window.setTimeout(
        runModuleWarmup,
        NETWORK_TIMEOUT_FALLBACK_MS,
      );
    };

    const handleSessionReady = () => {
      sessionReadyObserved = true;
      warmData();
    };

    const handleAppReady = () => {
      sessionReadyObserved = true;
      warmData();
      scheduleModuleWarmup();
    };

    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const appReady =
        document.documentElement.dataset.veinviteAppReady === 'true';
      if (sessionReadyObserved || appReady) warmData();
      if (appReady) scheduleModuleWarmup();
    };

    window.addEventListener(
      WALLET_SESSION_READY_EVENT,
      handleSessionReady,
    );

    if (document.documentElement.dataset.veinviteAppReady === 'true') {
      handleAppReady();
    } else {
      window.addEventListener(
        APP_READY_EVENT,
        handleAppReady,
        { once: true },
      );
    }

    document.addEventListener(
      'visibilitychange',
      handleVisible,
    );

    return () => {
      active = false;
      window.removeEventListener(
        WALLET_SESSION_READY_EVENT,
        handleSessionReady,
      );
      window.removeEventListener(
        APP_READY_EVENT,
        handleAppReady,
      );
      document.removeEventListener(
        'visibilitychange',
        handleVisible,
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
