'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const APP_READY_EVENT = 'veinvite-app-ready';
const IDLE_FALLBACK_MS = 900;

const RewardReservationRecovery = dynamic(
  () =>
    import('./RewardReservationRecovery').then(
      (module) => module.RewardReservationRecovery,
    ),
  { ssr: false },
);

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

/**
 * Non-critical runtime work should never compete with Home's first paint.
 * Reward finality recovery and the leaderboard forecast still start promptly,
 * but only after the initial app shell has been revealed and the browser gets
 * an idle slice (or a short fallback timeout).
 */
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

  return (
    <>
      <RewardReservationRecovery />
      <PublicRewardForecastPortal />
    </>
  );
}
