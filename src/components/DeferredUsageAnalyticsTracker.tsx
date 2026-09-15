'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const APP_READY_EVENT = 'veinvite-app-ready';
const STARTUP_FALLBACK_MS = 5_000;
const IDLE_TIMEOUT_MS = 1_200;

const UsageAnalyticsTracker = dynamic(
  () =>
    import('./UsageAnalyticsTracker').then(
      (module) => module.UsageAnalyticsTracker,
    ),
  { ssr: false },
);

type IdleCapableWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Product analytics is intentionally non-critical startup work. On Home we
 * wait for the app-ready boundary so analytics code and its first session POST
 * cannot compete with wallet/session/Home bootstrap. Other routes do not use
 * the Home readiness event, so they start during the first idle browser slice.
 * A bounded fallback preserves analytics if Home is waiting for user action.
 */
export function DeferredUsageAnalyticsTracker() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const idleWindow = window as IdleCapableWindow;
    let scheduled = false;
    let idleId: number | null = null;
    let timeoutId = 0;
    let fallbackId = 0;

    const activate = () => {
      setActive(true);
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.clearTimeout(fallbackId);

      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleId = idleWindow.requestIdleCallback(activate, {
          timeout: IDLE_TIMEOUT_MS,
        });
        return;
      }

      timeoutId = window.setTimeout(activate, IDLE_TIMEOUT_MS);
    };

    const isHome = window.location.pathname === '/';
    if (
      !isHome ||
      document.documentElement.dataset.veinviteAppReady === 'true'
    ) {
      schedule();
    } else {
      window.addEventListener(APP_READY_EVENT, schedule, { once: true });
      fallbackId = window.setTimeout(schedule, STARTUP_FALLBACK_MS);
    }

    return () => {
      window.removeEventListener(APP_READY_EVENT, schedule);
      window.clearTimeout(timeoutId);
      window.clearTimeout(fallbackId);
      if (
        idleId !== null &&
        typeof idleWindow.cancelIdleCallback === 'function'
      ) {
        idleWindow.cancelIdleCallback(idleId);
      }
    };
  }, []);

  return active ? <UsageAnalyticsTracker /> : null;
}
