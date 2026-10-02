'use client';

import { useEffect } from 'react';

export function useVisiblePeriodicRefresh({
  enabled,
  intervalMs,
  onRefresh,
  customWindowEvent = null,
}: {
  enabled: boolean;
  intervalMs: number;
  onRefresh: () => void | Promise<void>;
  customWindowEvent?: string | null;
}) {
  useEffect(() => {
    if (!enabled) return;

    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void onRefresh();
    };

    const timer = window.setInterval(
      refreshWhenVisible,
      intervalMs,
    );

    document.addEventListener(
      'visibilitychange',
      refreshWhenVisible,
    );
    window.addEventListener(
      'focus',
      refreshWhenVisible,
    );
    window.addEventListener(
      'pageshow',
      refreshWhenVisible,
    );
    if (customWindowEvent) {
      window.addEventListener(
        customWindowEvent,
        refreshWhenVisible,
      );
    }

    return () => {
      window.clearInterval(timer);
      document.removeEventListener(
        'visibilitychange',
        refreshWhenVisible,
      );
      window.removeEventListener(
        'focus',
        refreshWhenVisible,
      );
      window.removeEventListener(
        'pageshow',
        refreshWhenVisible,
      );
      if (customWindowEvent) {
        window.removeEventListener(
          customWindowEvent,
          refreshWhenVisible,
        );
      }
    };
  }, [
    customWindowEvent,
    enabled,
    intervalMs,
    onRefresh,
  ]);
}
