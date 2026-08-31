'use client';

import {
  useEffect,
  useState,
} from 'react';

import { Brand } from './Brand';

export function LocaleHydrationShield() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setReady(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  if (ready) return null;

  return (
    <div className="localeHydrationShield" aria-hidden="true">
      <Brand compact />
      <style jsx>{`
        .localeHydrationShield {
          position:fixed;
          inset:0;
          z-index:9999;
          display:grid;
          place-items:center;
          background:#080807;
          pointer-events:none;
        }
      `}</style>
    </div>
  );
}
