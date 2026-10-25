'use client';

import { useEffect } from 'react';
import { REWARD_X_PROMOTION_OAUTH_COPY } from '@/lib/i18n/rewardXPromotionOAuthCopy';
import { REWARD_X_PROMOTION_UI_FALLBACK_COPY } from '@/lib/i18n/rewardXPromotionUiFallbackCopy';
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
    if (status === 'connected') {
      showFeedback(
        'success',
        REWARD_X_PROMOTION_UI_FALLBACK_COPY[displayLocale].connectedX,
      );
    } else if ([
      'invalid', 'wallet', 'offer', 'provider', 'private',
      'conflict', 'unavailable', 'error',
    ].includes(status)) {
      const warning = status === 'conflict'
        ? REWARD_X_PROMOTION_OAUTH_COPY[displayLocale].conflict
        : REWARD_X_PROMOTION_OAUTH_COPY[displayLocale].failed;
      showFeedback('info', warning);
    }
  }, [showFeedback]);
}
