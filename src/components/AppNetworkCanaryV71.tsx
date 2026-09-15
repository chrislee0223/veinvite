'use client';

import { useLayoutEffect } from 'react';

import {
  getLocaleDirection,
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
    const direction = getLocaleDirection(resolvedLocale);
    const rootCopy = NETWORK_CANVAS_CONTROL_COPY[resolvedLocale].you;
    let frame = 0;

    const removePlacedLabel = (wrap: HTMLElement | null) => {
      if (!wrap) return;
      wrap.querySelector<HTMLElement>(':scope > .centerCircle > .v71CenterIdentityLabel')?.remove();
      wrap.querySelector<HTMLElement>(':scope > b.v71RootIdentitySource')
        ?.classList.remove('v71RootIdentitySource');
    };

    const apply = () => {
      const wrap = root.querySelector<HTMLElement>('.centerWrap');
      if (!wrap) return;

      const circle = wrap.querySelector<HTMLElement>(':scope > .centerCircle');
      const source = wrap.querySelector<HTMLElement>(':scope > b');
      if (!circle || !source) {
        removePlacedLabel(wrap);
        return;
      }

      if (source.dataset.v70RootLabel !== '1') {
        removePlacedLabel(wrap);
        return;
      }

      source.classList.add('v71RootIdentitySource');

      let label = circle.querySelector<HTMLElement>(':scope > .v71CenterIdentityLabel');
      if (!label) {
        label = document.createElement('span');
        label.className = 'v71CenterIdentityLabel';
        label.setAttribute('aria-hidden', 'true');
        circle.appendChild(label);
      }

      if (label.textContent !== rootCopy) label.textContent = rootCopy;
      label.dir = direction;

      const visibleLength = Array.from(rootCopy).length;
      label.dataset.v71Length = visibleLength > 6
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
      removePlacedLabel(root.querySelector<HTMLElement>('.centerWrap'));
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
        /* V71 owns only the root identity label placement. Keep the source row
           in flow so the established canvas geometry and summary spacing stay fixed. */
        .productionNetworkCanaryV45 .centerCircle {
          position: relative !important;
        }

        .productionNetworkCanaryV45 .centerWrap > b.v71RootIdentitySource {
          visibility: hidden !important;
        }

        .productionNetworkCanaryV45 .centerCircle > .v71CenterIdentityLabel {
          position: absolute !important;
          inset-inline: 7px !important;
          bottom: 9px !important;
          z-index: 4 !important;
          display: block !important;
          width: auto !important;
          min-width: 0 !important;
          max-width: calc(100% - 14px) !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          pointer-events: none !important;
          color: #f0c743 !important;
          font-size: .55rem !important;
          font-weight: 800 !important;
          line-height: 1.15 !important;
          letter-spacing: 0 !important;
          text-align: center !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          unicode-bidi: plaintext;
          text-shadow: 0 0 8px rgba(240, 199, 67, .14);
        }

        .productionNetworkCanaryV45 .centerCircle > .v71CenterIdentityLabel[data-v71-length='compact'] {
          inset-inline: 5px !important;
          max-width: calc(100% - 10px) !important;
          font-size: .50rem !important;
        }

        .productionNetworkCanaryV45 .centerCircle > .v71CenterIdentityLabel[data-v71-length='long'] {
          inset-inline: 4px !important;
          max-width: calc(100% - 8px) !important;
          font-size: .46rem !important;
        }

        html[data-locale-typography='arabic'] .productionNetworkCanaryV45 .centerCircle > .v71CenterIdentityLabel,
        html[data-locale-typography='indic'] .productionNetworkCanaryV45 .centerCircle > .v71CenterIdentityLabel {
          bottom: 8px !important;
          line-height: 1.28 !important;
        }
      `}</style>
    </>
  );
}
