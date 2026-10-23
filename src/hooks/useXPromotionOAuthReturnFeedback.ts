'use client';

import { useEffect } from 'react';
import { REWARD_X_PROMOTION_AUTO_COPY } from '@/lib/i18n/rewardXPromotionAutoCopy';
import {
  LANGUAGE_STORAGE_KEY, isLocale, resolveBrowserLocale,
} from '@/lib/i18n/locales';
import type { TransientFeedbackKind } from '@/components/TransientSnackbar';

export function useXPromotionOAuthReturnFeedback(
  showFeedback: (kind: TransientFeedbackKind, message: string) => void,
) {
  useEffect(() => {
    // Consume only the public callback status; never retain it in history.
    const url = new URL(window.location.href);
    const status = url.searchParams.get('xConnect');
    if (!status) return;
    url.searchParams.delete('xConnect');
    window.history.replaceState(
      window.history.state, '', url.pathname + url.search + url.hash,
    );

    let savedLocale: string | null = null;
    try {
      savedLocale = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
      // Browser fallback works in storage-restricted WebViews.
    }
    const displayLocale = isLocale(savedLocale)
      ? savedLocale
      : resolveBrowserLocale(window.navigator.languages, 'en');
    const copy = REWARD_X_PROMOTION_AUTO_COPY[displayLocale];

    if (status === 'connected') {
      showFeedback(
        'success',
        copy.connectedX,
      );
    } else if ([
      'invalid', 'wallet', 'offer', 'provider', 'private',
      'conflict', 'unavailable', 'error',
    ].includes(status)) {
      showFeedback(
        'info',
        status === 'conflict'
          ? copy.connectConflict
          : copy.connectFailed,
      );
    }
  }, [showFeedback]);
}
