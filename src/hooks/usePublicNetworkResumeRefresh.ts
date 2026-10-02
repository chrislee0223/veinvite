'use client';

import {
  useEffect,
  useRef,
} from 'react';

const RESUME_REFRESH_MIN_INTERVAL_MS = 1_500;

export function usePublicNetworkResumeRefresh<T>({
  ready,
  root,
  focusKey,
  blocked,
  fetchFocus,
  commit,
}: {
  ready: boolean;
  root: string;
  focusKey: string;
  blocked: boolean;
  fetchFocus: (
    rootWallet: string,
    focusWallet: string,
    signal: AbortSignal,
  ) => Promise<T>;
  commit: (value: T) => void;
}) {
  const controllerRef =
    useRef<AbortController | null>(null);
  const lastRefreshAtRef =
    useRef(0);

  useEffect(() => {
    if (
      !ready ||
      !root ||
      !focusKey ||
      blocked
    ) {
      return;
    }

    const refresh = () => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }

      const now = Date.now();
      if (
        now - lastRefreshAtRef.current <
        RESUME_REFRESH_MIN_INTERVAL_MS
      ) {
        return;
      }
      lastRefreshAtRef.current = now;

      controllerRef.current?.abort();
      const controller =
        new AbortController();
      controllerRef.current =
        controller;

      void fetchFocus(
        root,
        focusKey,
        controller.signal,
      )
        .then((value) => {
          if (!controller.signal.aborted) {
            commit(value);
          }
        })
        .catch(() => {
          // Resume refresh is best-effort. Keep the already visible network.
        })
        .finally(() => {
          if (
            controllerRef.current ===
            controller
          ) {
            controllerRef.current =
              null;
          }
        });
    };

    const onVisibilityChange = () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        refresh();
      }
    };

    window.addEventListener(
      'focus',
      refresh,
    );
    document.addEventListener(
      'visibilitychange',
      onVisibilityChange,
    );

    return () => {
      window.removeEventListener(
        'focus',
        refresh,
      );
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      );
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [
    ready,
    root,
    focusKey,
    blocked,
    fetchFocus,
    commit,
  ]);
}
