'use client';

import { useLayoutEffect } from 'react';

import {
  getLocaleDirection,
  type Locale,
} from '@/lib/i18n/locales';
import { getNetworkCanaryInteractionCopy } from '@/lib/i18n/networkCanaryInteractionCopy';
import { AppNetworkCanaryV64 } from './AppNetworkCanaryV64';

function NetworkCanaryLocalizationV65({ locale }: { locale: Locale }) {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.productionNetworkCanaryV45');
    if (!root) return;

    const copy = getNetworkCanaryInteractionCopy(locale);
    const direction = getLocaleDirection(locale);

    const localizeDropLabel = (element: HTMLElement) => {
      const value = element.dataset.v61DropLabel;
      if (!value) return;

      const variants: Array<[string, (group: string) => string]> = [
        ['Already in ', copy.alreadyIn],
        ['Release to move to ', copy.releaseMove],
        ['Release to add to ', copy.releaseAdd],
      ];

      for (const [prefix, formatter] of variants) {
        if (!value.startsWith(prefix)) continue;
        const groupName = value.slice(prefix.length).trim();
        if (!groupName) return;
        const localized = formatter(groupName);
        if (localized !== value) element.dataset.v61DropLabel = localized;
        return;
      }
    };

    const localizeStatusLabel = (
      element: HTMLElement,
      dataKey: 'v61AcceptedLabel' | 'v63VerifiedLabel',
    ) => {
      const value = element.dataset[dataKey];
      if (!value) return;
      const localized = value === '✓ Moved'
        ? copy.moved
        : value === '✓ Added'
          ? copy.added
          : null;
      if (localized && localized !== value) element.dataset[dataKey] = localized;
    };

    const localizeToast = (element: HTMLElement) => {
      if (!element.classList.contains('v63GestureToast')) return;
      const value = element.textContent?.trim() ?? '';
      const localized = value === 'Couldn’t save this position.'
        ? copy.saveError
        : value === 'Couldn’t confirm the group move.'
          ? copy.confirmMoveError
          : null;
      element.dir = direction;
      if (localized && localized !== value) element.textContent = localized;
    };

    const localizeElement = (element: Element) => {
      if (!(element instanceof HTMLElement)) return;
      if (element.hasAttribute('data-v61-drop-label')) localizeDropLabel(element);
      if (element.hasAttribute('data-v61-accepted-label')) {
        localizeStatusLabel(element, 'v61AcceptedLabel');
      }
      if (element.hasAttribute('data-v63-verified-label')) {
        localizeStatusLabel(element, 'v63VerifiedLabel');
      }
      localizeToast(element);
      element.querySelectorAll<HTMLElement>(
        '[data-v61-drop-label],[data-v61-accepted-label],[data-v63-verified-label],.v63GestureToast',
      ).forEach((child) => {
        if (child.hasAttribute('data-v61-drop-label')) localizeDropLabel(child);
        if (child.hasAttribute('data-v61-accepted-label')) {
          localizeStatusLabel(child, 'v61AcceptedLabel');
        }
        if (child.hasAttribute('data-v63-verified-label')) {
          localizeStatusLabel(child, 'v63VerifiedLabel');
        }
        localizeToast(child);
      });
    };

    localizeElement(root);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          if (mutation.target instanceof Element) localizeElement(mutation.target);
          continue;
        }
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement;
          if (parent) localizeToast(parent);
          continue;
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) localizeElement(node);
        });
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'data-v61-drop-label',
        'data-v61-accepted-label',
        'data-v63-verified-label',
        'class',
      ],
    });

    return () => observer.disconnect();
  }, [locale]);

  return null;
}

export function AppNetworkCanaryV65({ locale }: { locale: Locale }) {
  return (
    <>
      <AppNetworkCanaryV64 locale={locale} />
      <NetworkCanaryLocalizationV65 locale={locale} />
      <style jsx global>{`
        .productionNetworkCanaryV45 .v42GroupHub.v61DropPreview::after,
        .productionNetworkCanaryV45 .v42GroupRow.v61DropPreview::after,
        .productionNetworkCanaryV45 .v42GroupHub.v61GroupAccepted::after,
        .productionNetworkCanaryV45 .v42GroupRow.v61GroupAccepted::after,
        .productionNetworkCanaryV45 .v42GroupHub.v63VerifiedTransfer::after,
        .productionNetworkCanaryV45 .v42GroupRow.v63VerifiedTransfer::after {
          direction: inherit;
          unicode-bidi: plaintext;
          max-width: min(190px, 72vw);
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          line-height: 1.25;
          text-align: start;
        }

        .productionNetworkCanaryV45 .v63GestureToast {
          width: max-content;
          max-width: calc(100% - 24px);
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          text-align: center;
          line-height: 1.35;
        }
      `}</style>
    </>
  );
}
