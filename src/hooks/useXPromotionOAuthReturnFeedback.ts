'use client';

import { useEffect } from 'react';
import { REWARD_X_PROMOTION_OAUTH_COPY } from '@/lib/i18n/rewardXPromotionOAuthCopy';
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
    const copy = REWARD_X_PROMOTION_OAUTH_COPY[displayLocale];

    if (status === 'connected') {
      showFeedback('success', copy.connectedX);
    } else if (status === 'conflict') {
      showFeedback('info', copy.conflictBody);
    } else if (status === 'private') {
      showFeedback('info', copy.privateBody);
    } else if ([
      'invalid', 'wallet', 'offer', 'provider',
      'unavailable', 'error',
    ].includes(status)) {
      showFeedback('info', copy.failedBody);
    }
  }, [showFeedback]);
}
