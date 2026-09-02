'use client';

import {
  useEffect,
  useState,
} from 'react';

import { Brand } from './Brand';

const APP_READY_EVENT = 'veinvite-app-ready';
const APP_READY_FALLBACK_MS = 5_000;

export function LocaleHydrationShield() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    let fallbackTimer = 0;
    let released = false;

    const release = () => {
      if (released) {
        return;
      }
      released = true;

      // Keep one stable painted frame between the client provider becoming
      // ready and removing the SSR-visible shield. This prevents a black flash
      // while the provider tree finishes its first browser paint.
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          setReady(true);
        });
      });
    };

    const handleAppReady = () => {
      release();
    };

    if (
      document.documentElement.dataset
        .veinviteAppReady === 'true'
    ) {
      release();
    } else {
      window.addEventListener(
        APP_READY_EVENT,
        handleAppReady,
        { once: true },
      );
    }

    // Never let a third-party wallet/provider initialization failure trap the
    // user behind the splash forever. The app's own error/recovery UI remains
    // available after this bounded fallback.
    fallbackTimer = window.setTimeout(
      release,
      APP_READY_FALLBACK_MS,
    );

    return () => {
      window.removeEventListener(
        APP_READY_EVENT,
        handleAppReady,
      );
      window.clearTimeout(fallbackTimer);
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  if (ready) return null;

  return (
    <div
      className="localeHydrationShield"
      aria-hidden="true"
    >
      <Brand compact />
      <style jsx>{`
        .localeHydrationShield {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          background:
            radial-gradient(
              circle at 50% 42%,
              rgba(244, 183, 40, 0.1),
              transparent 30%
            ),
            #080807;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
