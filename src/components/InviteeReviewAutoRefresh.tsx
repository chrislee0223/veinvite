'use client';

import {
  useCallback,
  useEffect,
  useRef,
} from 'react';

import type { InviteRecord } from '@/lib/types';

const POLL_INTERVAL_MS = 15_000;

type InviteResponse = {
  invite?: InviteRecord;
};

export function InviteeReviewAutoRefresh({
  code,
}: {
  code: string;
}) {
  const previousStatusRef =
    useRef<InviteRecord['status'] | null>(null);
  const checkingRef = useRef(false);

  const check = useCallback(async () => {
    if (
      checkingRef.current ||
      document.visibilityState === 'hidden'
    ) {
      return;
    }

    checkingRef.current = true;

    try {
      const response = await fetch(
        `/api/invites/${encodeURIComponent(code)}`,
        { cache: 'no-store' },
      );

      if (!response.ok) {
        return;
      }

      const data =
        (await response.json()) as InviteResponse;
      const nextStatus = data.invite?.status;

      if (!nextStatus) {
        return;
      }

      const previousStatus =
        previousStatusRef.current;

      if (previousStatus === null) {
        previousStatusRef.current = nextStatus;
        return;
      }

      const enteredReview =
        previousStatus !== 'UNDER_REVIEW' &&
        nextStatus === 'UNDER_REVIEW';
      const leftReview =
        previousStatus === 'UNDER_REVIEW' &&
        nextStatus !== 'UNDER_REVIEW';

      previousStatusRef.current = nextStatus;

      if (enteredReview || leftReview) {
        window.location.reload();
      }
    } catch {
      // Background status sync is best-effort. The visible invite flow remains
      // usable, and the next interval/focus event retries automatically.
    } finally {
      checkingRef.current = false;
    }
  }, [code]);

  useEffect(() => {
    previousStatusRef.current = null;
    void check();

    const intervalId = window.setInterval(
      () => {
        void check();
      },
      POLL_INTERVAL_MS,
    );

    const onFocus = () => {
      void check();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void check();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener(
      'visibilitychange',
      onVisibilityChange,
    );

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      );
    };
  }, [check]);

  return null;
}
