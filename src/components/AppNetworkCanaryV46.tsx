'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Locale } from '@/lib/i18n/locales';
import { AppNetworkCanaryV45 } from './AppNetworkCanaryV45';

export function AppNetworkCanaryV46({ locale }: { locale: Locale }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [navHost, setNavHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const next = root.querySelector<HTMLElement>('.navActions');
        setNavHost((current) => current === next ? current : next);
      });
    };

    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    sync();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const triggerViewAction = (action: 'you' | 'fit') => {
    const root = rootRef.current;
    if (!root) return;

    const button = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.viewActions button'),
    ).find((candidate) => {
      const label = candidate.textContent?.trim() ?? '';
      return action === 'fit' ? label === 'Fit' : label.includes('YOU');
    });

    button?.click();
  };

  return (
    <div ref={rootRef} className="productionNetworkCanaryV46">
      <AppNetworkCanaryV45 locale={locale} />

      {navHost ? createPortal(
        <div className="v46ViewActions" aria-label="Network view controls">
          <button type="button" onClick={() => triggerViewAction('you')}>◎ YOU</button>
          <button type="button" onClick={() => triggerViewAction('fit')}>Fit</button>
        </div>,
        navHost,
      ) : null}

      <style jsx global>{`
        .productionNetworkCanaryV46 .productionNetworkCanaryV45 .canaryViewActions {
          display:none!important;
        }
        .productionNetworkCanaryV46 .productionNetworkCanaryV45 .controlBar,
        .productionNetworkCanaryV46 .productionNetworkCanaryV45 .networkShell {
          width:min(100%,520px)!important;
        }
        .productionNetworkCanaryV46 .productionNetworkCanaryV45 .networkShell {
          border-color:rgba(255,205,80,.14)!important;
          border-radius:21px!important;
        }
        .productionNetworkCanaryV46 .productionNetworkCanaryV45 .navActions {
          flex-wrap:nowrap!important;
          overflow-x:auto!important;
          scrollbar-width:none;
        }
        .productionNetworkCanaryV46 .productionNetworkCanaryV45 .navActions::-webkit-scrollbar {
          display:none;
        }
        .productionNetworkCanaryV46 .productionNetworkCanaryV45 .navActions > button,
        .productionNetworkCanaryV46 .productionNetworkCanaryV45 .v42GroupToolbarButton,
        .productionNetworkCanaryV46 .v46ViewActions {
          flex:0 0 auto!important;
        }
        .productionNetworkCanaryV46 .productionNetworkCanaryV45 .v42GroupToolbarButton {
          order:60!important;
        }
        .productionNetworkCanaryV46 .v46ViewActions {
          order:61;
          display:flex;
          align-items:center;
          gap:4px;
        }
        .productionNetworkCanaryV46 .v46ViewActions button {
          height:28px;
          padding:0 9px;
          border:1px solid rgba(255,255,255,.07);
          border-radius:8px;
          background:#0e0e0c;
          color:#918a7e;
          font:inherit;
          font-size:.48rem;
          font-weight:400;
          line-height:1;
          touch-action:manipulation;
          cursor:pointer;
        }
        .productionNetworkCanaryV46 .v46ViewActions button:hover {
          border-color:rgba(244,183,40,.22);
          color:#c1a75f;
        }
        .productionNetworkCanaryV46 .v46ViewActions button:focus-visible {
          outline:1px solid rgba(255,205,80,.55);
          outline-offset:2px;
        }
        @media(max-width:640px) {
          .productionNetworkCanaryV46 .productionNetworkCanaryV45 .controlBar,
          .productionNetworkCanaryV46 .productionNetworkCanaryV45 .networkShell {
            width:100%!important;
          }
          .productionNetworkCanaryV46 .v46ViewActions button {
            padding:0 8px;
            font-size:.45rem;
          }
        }
        @media(prefers-reduced-motion:reduce) {
          .productionNetworkCanaryV46 .v46ViewActions button {
            transition:none!important;
          }
        }
      `}</style>
    </div>
  );
}
