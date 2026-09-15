'use client';

import { useLayoutEffect } from 'react';

import {
  isLocale,
  type Locale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { NETWORK_CANVAS_CONTROL_COPY } from '@/lib/i18n/networkCanvasControlCopy';
import { AppNetworkCanaryV70 } from './AppNetworkCanaryV70';

function resolveLocale(locale: Locale): SupportedLocale {
  return isLocale(locale) ? locale : 'en';
}

function NetworkRootIdentityPlacementV71({ locale }: { locale: Locale }) {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    if (!root) return;

    const resolvedLocale = resolveLocale(locale);
    const rootCopy = NETWORK_CANVAS_CONTROL_COPY[resolvedLocale].you;
    let frame = 0;

    const clearRootIdentity = (wrap: HTMLElement | null) => {
      if (!wrap) return;
      const circle = wrap.querySelector<HTMLElement>(':scope > .centerCircle');
      const source = wrap.querySelector<HTMLElement>(':scope > b');

      circle?.removeAttribute('data-v71-root-copy');
      circle?.removeAttribute('data-v71-root-length');
      source?.classList.remove('v71RootIdentitySource');

      // Remove the previous V71 injected-label implementation if it exists in a
      // live session. The root identity now replaces the original center dot.
      circle?.querySelector<HTMLElement>(':scope > .v71CenterIdentityLabel')?.remove();
    };

    const apply = () => {
      const wrap = root.querySelector<HTMLElement>('.centerWrap');
      if (!wrap) return;

      const circle = wrap.querySelector<HTMLElement>(':scope > .centerCircle');
      const source = wrap.querySelector<HTMLElement>(':scope > b');
      if (!circle || !source) {
        clearRootIdentity(wrap);
        return;
      }

      // V70 marks only the actual root identity. Descendant networks keep the
      // mature center-dot behavior and their normal wallet label.
      if (source.dataset.v70RootLabel !== '1') {
        clearRootIdentity(wrap);
        return;
      }

      source.classList.add('v71RootIdentitySource');
      circle.dataset.v71RootCopy = rootCopy;

      const visibleLength = Array.from(rootCopy).length;
      circle.dataset.v71RootLength = visibleLength > 6
        ? 'long'
        : visibleLength > 4
          ? 'compact'
          : 'normal';
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };

    apply();

    const observer = new MutationObserver(() => schedule());
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-v70-root-label'],
    });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      clearRootIdentity(root.querySelector<HTMLElement>('.centerWrap'));
    };
  }, [locale]);

  return null;
}

export function AppNetworkCanaryV71({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV70 locale={locale} />
      <NetworkRootIdentityPlacementV71 locale={locale} />
      <style jsx global>{`
        /* Root identity: replace the existing V45 center dot itself. Do not add
           another label layer, and keep the legacy source row only as invisible
           geometry so existing line/canvas alignment cannot shift. */
        .productionNetworkCanaryV45 .centerWrap > b.v71RootIdentitySource {
          visibility: hidden !important;
        }

        .productionNetworkCanaryV45 .centerCircle[data-v71-root-copy]::after {
          content: attr(data-v71-root-copy) !important;
          left: 50% !important;
          top: 50% !important;
          width: auto !important;
          height: auto !important;
          min-width: 0 !important;
          max-width: calc(100% - 16px) !important;
          transform: translate(-50%, -50%) !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          color: #efc64c !important;
          font-size: .58rem !important;
          font-family: inherit !important;
          font-weight: 850 !important;
          line-height: 1.12 !important;
          letter-spacing: 0 !important;
          text-align: center !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          unicode-bidi: plaintext;
          text-shadow: 0 0 10px rgba(239, 198, 76, .18);
        }

        .productionNetworkCanaryV45 .centerCircle[data-v71-root-length='compact']::after {
          font-size: .53rem !important;
        }

        .productionNetworkCanaryV45 .centerCircle[data-v71-root-length='long']::after {
          font-size: .48rem !important;
          max-width: calc(100% - 10px) !important;
        }

        html[data-locale-typography='arabic'] .productionNetworkCanaryV45 .centerCircle[data-v71-root-copy]::after,
        html[data-locale-typography='indic'] .productionNetworkCanaryV45 .centerCircle[data-v71-root-copy]::after {
          line-height: 1.28 !important;
        }
      `}</style>
    </>
  );
}
