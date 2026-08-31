'use client';

import { useEffect } from 'react';

export const LEGAL_RETURN_STORAGE_KEY = 'veinvite-legal-return';

export function LegalNavigationMemory() {
  useEffect(() => {
    const rememberLegalOrigin = (event: MouseEvent) => {
      // Record only a normal same-tab navigation. Modified clicks/new tabs
      // should not leave a stale return marker in the current app session.
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

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (url.pathname !== '/privacy' && url.pathname !== '/terms') return;

      window.sessionStorage.setItem(
        LEGAL_RETURN_STORAGE_KEY,
        window.location.pathname + window.location.search,
      );
    };

    document.addEventListener('click', rememberLegalOrigin, true);
    return () =>
      document.removeEventListener('click', rememberLegalOrigin, true);
  }, []);

  return null;
}
