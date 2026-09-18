'use client';

import { useCallback, useEffect, useRef } from 'react';

const CLIENT_RELEASE = process.env.NEXT_PUBLIC_APP_RELEASE ?? 'dev';
const CHECK_COOLDOWN_MS = 15_000;
const CACHE_BUST_PARAM = '__veinvite_release';

type RuntimeVersionPayload = {
  release?: string;
};

function cleanCacheBustParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(CACHE_BUST_PARAM)) return;
  url.searchParams.delete(CACHE_BUST_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function RuntimeVersionGuard() {
  const lastCheckRef = useRef(0);
  const reloadingRef = useRef(false);

  const checkVersion = useCallback(async (force = false) => {
    if (reloadingRef.current) return;
    const now = Date.now();
    if (!force && now - lastCheckRef.current < CHECK_COOLDOWN_MS) return;
    lastCheckRef.current = now;

    try {
      const response = await fetch(`/api/runtime-version?_=${now}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;

      const payload = await response.json() as RuntimeVersionPayload;
      const serverRelease = payload.release?.trim();
      if (!serverRelease || serverRelease === 'dev' || CLIENT_RELEASE === 'dev') {
        cleanCacheBustParam();
        return;
      }

      if (serverRelease === CLIENT_RELEASE) {
        cleanCacheBustParam();
        return;
      }

      reloadingRef.current = true;
      const url = new URL(window.location.href);
      url.searchParams.set(CACHE_BUST_PARAM, serverRelease.slice(0, 12));
      window.location.replace(url.toString());
    } catch {
      // Version checks are intentionally non-blocking. A transient network
      // failure must never interrupt normal VeInvite usage.
    }
  }, []);

  useEffect(() => {
    void checkVersion(true);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkVersion();
    };
    const onFocus = () => void checkVersion();
    const onPageShow = () => void checkVersion(true);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [checkVersion]);

  return null;
}
