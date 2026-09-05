'use client';

import { useEffect } from 'react';

import {
  localeFromLanguageTag,
  resolveBrowserLocale,
} from '@/lib/i18n/locales';
import {
  LEGAL_DOCUMENT_SHEET_OPEN_EVENT,
  type LegalDocumentReturnView,
  type LegalDocumentSheetOpenDetail,
} from '@/lib/legalDocumentSheet';

export const LEGAL_RETURN_STORAGE_KEY = 'veinvite-legal-return';

const RESTORABLE_TABS = new Set<LegalDocumentReturnView>([
  'home',
  'guide',
  'leaderboard',
  'settings',
]);

function readStoredLegalReturn(): string | null {
  try {
    return window.sessionStorage.getItem(
      LEGAL_RETURN_STORAGE_KEY,
    );
  } catch {
    return null;
  }
}

function writeStoredLegalReturn(value: string) {
  try {
    window.sessionStorage.setItem(
      LEGAL_RETURN_STORAGE_KEY,
      value,
    );
  } catch {
    // Direct-route fallback still works when session storage is unavailable.
  }
}

function removeStoredLegalReturn() {
  try {
    window.sessionStorage.removeItem(
      LEGAL_RETURN_STORAGE_KEY,
    );
  } catch {
    // Nothing to clean up in storage-restricted browser modes.
  }
}

function cleanTabParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('tab')) return;
  url.searchParams.delete('tab');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', next || '/');
}

function resolveLegalSheetLocale() {
  const documentLocale = localeFromLanguageTag(
    document.documentElement.lang,
  );
  if (documentLocale) return documentLocale;
  return resolveBrowserLocale(window.navigator.languages, 'en');
}

function resolveLegalReturnView(
  anchor: HTMLAnchorElement,
): LegalDocumentReturnView {
  if (
    anchor.closest('.legalCard') ||
    anchor.dataset.legalReturn === 'settings'
  ) {
    return 'settings';
  }

  const activeTab = document
    .querySelector<HTMLElement>('.bottomNavigation')
    ?.dataset.veinviteActiveTab;

  if (
    activeTab &&
    RESTORABLE_TABS.has(
      activeTab as LegalDocumentReturnView,
    )
  ) {
    return activeTab as LegalDocumentReturnView;
  }

  const pathname = window.location.pathname;
  if (
    pathname === '/i' ||
    pathname.startsWith('/i/') ||
    pathname === '/r' ||
    pathname.startsWith('/r/')
  ) {
    return 'invite_landing';
  }

  return pathname === '/' ? 'home' : 'other';
}

export function LegalNavigationMemory() {
  useEffect(() => {
    let restoreFrame = 0;

    const restoreRequestedTab = () => {
      window.cancelAnimationFrame(restoreFrame);

      const requestedTab = new URLSearchParams(window.location.search).get('tab');
      if (
        !requestedTab ||
        !RESTORABLE_TABS.has(
          requestedTab as LegalDocumentReturnView,
        )
      ) {
        return;
      }

      let attempts = 0;
      const tryRestore = () => {
        const button = document.querySelector<HTMLButtonElement>(
          `button[data-veinvite-tab="${requestedTab}"]`,
        );

        if (button) {
          button.click();
          cleanTabParam();
          return;
        }

        attempts += 1;
        if (attempts < 20) {
          restoreFrame = window.requestAnimationFrame(tryRestore);
        }
      };

      tryRestore();
    };

    const rememberLegalOrigin = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;

      const savedReturn = readStoredLegalReturn();

      if (
        anchor.classList.contains('legalBack') &&
        savedReturn?.includes('tab=settings')
      ) {
        event.preventDefault();
        removeStoredLegalReturn();
        window.history.back();
        return;
      }

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (url.pathname !== '/privacy' && url.pathname !== '/terms') return;

      const currentPath = window.location.pathname;
      const canUseSheet =
        document.documentElement.dataset.veinviteLegalSheetReady === 'true' &&
        currentPath !== '/privacy' &&
        currentPath !== '/terms';

      if (canUseSheet) {
        event.preventDefault();
        const detail: LegalDocumentSheetOpenDetail = {
          kind: url.pathname === '/privacy' ? 'privacy' : 'terms',
          locale: resolveLegalSheetLocale(),
          returnView: resolveLegalReturnView(anchor),
        };
        window.dispatchEvent(
          new CustomEvent(
            LEGAL_DOCUMENT_SHEET_OPEN_EVENT,
            { detail },
          ),
        );
        return;
      }

      const returnToSettings =
        Boolean(anchor.closest('.legalCard')) ||
        anchor.dataset.legalReturn === 'settings';

      const currentUrl = new URL(window.location.href);
      if (returnToSettings) {
        currentUrl.searchParams.set('tab', 'settings');
        const markedUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
        window.history.replaceState(window.history.state, '', markedUrl);
      }

      writeStoredLegalReturn(
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
      );
    };

    restoreRequestedTab();
    window.addEventListener('popstate', restoreRequestedTab);
    document.addEventListener('click', rememberLegalOrigin, true);

    return () => {
      window.cancelAnimationFrame(restoreFrame);
      window.removeEventListener('popstate', restoreRequestedTab);
      document.removeEventListener('click', rememberLegalOrigin, true);
    };
  }, []);

  return null;
}
