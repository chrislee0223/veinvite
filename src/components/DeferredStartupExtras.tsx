'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const APP_READY_EVENT = 'veinvite-app-ready';
const IDLE_FALLBACK_MS = 900;

const PublicRewardForecastPortal = dynamic(
  () =>
    import('./PublicRewardForecastPortal').then(
      (module) => module.PublicRewardForecastPortal,
    ),
  { ssr: false },
);

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function DeferredStartupExtras() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let timeoutId = 0;
    let idleId: number | null = null;
    let scheduled = false;

    const activate = () => {
      if (scheduled) return;
      scheduled = true;

      const idleWindow = window as IdleWindow;
      if (idleWindow.requestIdleCallback) {
        idleId = idleWindow.requestIdleCallback(
          () => setActive(true),
          { timeout: IDLE_FALLBACK_MS },
        );
        return;
      }

      timeoutId = window.setTimeout(
        () => setActive(true),
        IDLE_FALLBACK_MS,
      );
    };

    if (
      document.documentElement.dataset.veinviteAppReady === 'true'
    ) {
      activate();
    } else {
      window.addEventListener(APP_READY_EVENT, activate, { once: true });
    }

    return () => {
      window.removeEventListener(APP_READY_EVENT, activate);
      window.clearTimeout(timeoutId);
      const idleWindow = window as IdleWindow;
      if (idleId !== null && idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(idleId);
      }
    };
  }, []);

  if (!active) return null;

  return <PublicRewardForecastPortal />;
}
