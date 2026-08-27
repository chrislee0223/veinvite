'use client';

import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { useWallet } from '@vechain/vechain-kit';

import type { InviteRecord } from '@/lib/types';

const POLL_INTERVAL_MS = 15_000;

function inviteFingerprint(
  invite: InviteRecord | undefined,
) {
  if (!invite) {
    return 'none';
  }

  return [
    invite.code,
    invite.status,
    invite.inviteeAddress ?? '',
    invite.rewardEligibility,
  ].join(':');
}

/**
 * Keeps the inviter home screen in sync when the invitee changes state in a
 * different browser/device. HomeClient owns the visible UI and already loads
 * authoritative server state on mount; this watcher only reloads when the
 * server-observed invite state actually changes.
 */
export function InviteStatusAutoRefresh() {
  const { account } = useWallet();
  const walletAddress =
    account?.address?.toLowerCase() ?? null;
  const lastFingerprintRef =
    useRef<string | null>(null);
  const checkingRef = useRef(false);

  const check = useCallback(async () => {
    if (
      !walletAddress ||
      checkingRef.current ||
      document.visibilityState === 'hidden'
    ) {
      return;
    }

    checkingRef.current = true;

    try {
      const response = await fetch(
        `/api/invites?inviter=${encodeURIComponent(
          walletAddress,
        )}`,
        {
          cache: 'no-store',
        },
      );

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        invites?: InviteRecord[];
      };
      const fingerprint = inviteFingerprint(
        data.invites?.[0],
      );

      if (lastFingerprintRef.current === null) {
        lastFingerprintRef.current = fingerprint;
        return;
      }

      if (lastFingerprintRef.current !== fingerprint) {
        window.location.reload();
      }
    } catch {
      // HomeClient remains usable when a background refresh fails. The next
      // interval/focus event will retry without surfacing a disruptive toast.
    } finally {
      checkingRef.current = false;
    }
  }, [walletAddress]);

  useEffect(() => {
    lastFingerprintRef.current = null;

    if (!walletAddress) {
      return;
    }

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
  }, [check, walletAddress]);

  return null;
}
