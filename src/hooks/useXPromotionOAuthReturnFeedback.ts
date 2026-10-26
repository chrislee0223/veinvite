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
    const korean = displayLocale === 'ko';

    if (status === 'connected') {
      showFeedback(
        'success',
        REWARD_X_PROMOTION_AUTO_COPY[displayLocale].connectedX,
      );
    } else if ([
      'invalid', 'wallet', 'offer', 'provider', 'private',
      'conflict', 'unavailable', 'error',
    ].includes(status)) {
      const warning = status === 'conflict'
        ? (korean
            ? '이 X 계정은 다른 지갑과 연결되어 있어요. 게시물 링크 제출 방식은 계속 사용할 수 있어요.'
            : 'This X account cannot be linked to this wallet. Manual Post URL submission is still available.')
        : (korean
            ? 'X 계정을 연결하지 못했어요. 다시 시도하거나 게시물 링크를 직접 제출해 주세요.'
            : 'X account connection did not complete. Retry or submit your public Post URL manually.');
      showFeedback('info', warning);
    }
  }, [showFeedback]);
}
