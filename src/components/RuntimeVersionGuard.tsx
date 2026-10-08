'use client';

import { useCallback, useEffect, useRef } from 'react';

const CLIENT_RELEASE = process.env.NEXT_PUBLIC_APP_RELEASE ?? 'dev';
const CHECK_COOLDOWN_MS = 15_000;
const CACHE_BUST_PARAM = '__veinvite_release';
const APP_READY_EVENT = 'veinvite-app-ready';
const PROVIDER_READY_EVENT = 'veinvite-provider-ready';
const STARTUP_VERSION_CHECK_TIMEOUT_MS = 2_000;
const STARTUP_VERSION_FAILSAFE_MS = 10_000;

type RuntimeVersionPayload = {
  release?: string;
};

type IdleCapableWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (id: number) => void;
};

function cleanCacheBustParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(CACHE_BUST_PARAM)) return;
  url.searchParams.delete(CACHE_BUST_PARAM);
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
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
      if (
        !serverRelease ||
        serverRelease === 'dev' ||
        CLIENT_RELEASE === 'dev'
      ) {
        cleanCacheBustParam();
        return;
      }

      if (serverRelease === CLIENT_RELEASE) {
        cleanCacheBustParam();
        return;
      }

      reloadingRef.current = true;
      const url = new URL(window.location.href);
      url.searchParams.set(
        CACHE_BUST_PARAM,
        serverRelease.slice(0, 12),
      );
      window.location.replace(url.toString());
    } catch {
      // Version checks are intentionally non-blocking. A transient network
      // failure must never interrupt normal VeInvite usage.
    }
  }, []);

  useEffect(() => {
    const idleWindow = window as IdleCapableWindow;
    let idleId: number | null = null;
    let idleFallbackId: number | null = null;
    let startupFailsafeId: number | null = null;
    let scheduled = false;

    const clearScheduledCheck = () => {
      if (
        idleId !== null &&
        typeof idleWindow.cancelIdleCallback === 'function'
      ) {
        idleWindow.cancelIdleCallback(idleId);
      }
      if (idleFallbackId !== null) {
        window.clearTimeout(idleFallbackId);
      }
      idleId = null;
      idleFallbackId = null;
      scheduled = false;
    };

    const clearStartupFailsafe = () => {
      if (startupFailsafeId !== null) {
        window.clearTimeout(startupFailsafeId);
        startupFailsafeId = null;
      }
    };

    const scheduleCheck = (force = false) => {
      if (reloadingRef.current || scheduled) {
        return;
      }

      scheduled = true;
      const run = () => {
        idleId = null;
        idleFallbackId = null;
        scheduled = false;
        void checkVersion(force);
      };

      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleId = idleWindow.requestIdleCallback(run, {
          timeout: STARTUP_VERSION_CHECK_TIMEOUT_MS,
        });
        return;
      }

      idleFallbackId = window.setTimeout(
        run,
        STARTUP_VERSION_CHECK_TIMEOUT_MS,
      );
    };

    const startupReady = () => {
      const isHome = window.location.pathname === '/';

      return isHome
        ? document.documentElement.dataset.veinviteAppReady === 'true'
        : document.documentElement.dataset.veinviteProviderReady === 'true';
    };

    const scheduleAfterStartup = (force = false) => {
      if (!startupReady()) {
        return false;
      }

      clearStartupFailsafe();
      scheduleCheck(force);
      return true;
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        scheduleAfterStartup();
      }
    };
    const onFocus = () => {
      scheduleAfterStartup();
    };
    const onPageShow = () => {
      scheduleAfterStartup(true);
    };
    const onAppReady = () => {
      clearStartupFailsafe();
      scheduleCheck(true);
    };
    const onProviderReady = () => {
      if (window.location.pathname !== '/') {
        clearStartupFailsafe();
        scheduleCheck(true);
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener(APP_READY_EVENT, onAppReady);
    window.addEventListener(PROVIDER_READY_EVENT, onProviderReady);

    if (!scheduleAfterStartup(true)) {
      startupFailsafeId = window.setTimeout(() => {
        startupFailsafeId = null;

        if (startupReady()) {
          scheduleCheck(true);
          return;
        }

        // Emergency recovery only: if an old/incompatible client never reaches
        // the normal startup-ready signals, still allow one version check so a
        // newer deployment can self-recover. Normal startup never waits on this.
        void checkVersion(true);
      }, STARTUP_VERSION_FAILSAFE_MS);
    }

    return () => {
      clearStartupFailsafe();
      clearScheduledCheck();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener(APP_READY_EVENT, onAppReady);
      window.removeEventListener(PROVIDER_READY_EVENT, onProviderReady);
    };
  }, [checkVersion]);

  return null;
}
