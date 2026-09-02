'use client';

import {
  useEffect,
  useState,
} from 'react';

import { Brand } from './Brand';

const APP_READY_EVENT = 'veinvite-app-ready';
const PROVIDER_READY_EVENT =
  'veinvite-provider-ready';
const APP_READY_FALLBACK_MS = 8_000;

export function LocaleHydrationShield() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    let fallbackTimer = 0;
    let released = false;
    const isHome = window.location.pathname === '/';

    const release = () => {
      if (released) {
        return;
      }
      released = true;

      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          setReady(true);
        });
      });
    };

    const handleAppReady = () => {
      release();
    };
    const handleProviderReady = () => {
      if (!isHome) {
        release();
      }
    };

    if (
      document.documentElement.dataset
        .veinviteAppReady === 'true'
    ) {
      release();
    } else if (
      !isHome &&
      document.documentElement.dataset
        .veinviteProviderReady === 'true'
    ) {
      release();
    } else {
      window.addEventListener(
        APP_READY_EVENT,
        handleAppReady,
        { once: true },
      );
      window.addEventListener(
        PROVIDER_READY_EVENT,
        handleProviderReady,
      );
    }

    fallbackTimer = window.setTimeout(
      release,
      APP_READY_FALLBACK_MS,
    );

    return () => {
      window.removeEventListener(
        APP_READY_EVENT,
        handleAppReady,
      );
      window.removeEventListener(
        PROVIDER_READY_EVENT,
        handleProviderReady,
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
              circle at 50% 38%,
              rgba(244, 183, 40, 0.1),
              transparent 32%
            ),
            #080807;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
