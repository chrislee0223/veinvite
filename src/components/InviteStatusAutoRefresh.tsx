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
  invite: InviteRecord,
) {
  return [
    invite.code,
    invite.status,
    invite.inviteeAddress ?? '',
    invite.rewardEligibility,
    invite.rewardQueueStatus ?? '',
    invite.rewardClaimRequestedAt ?? '',
  ].join(':');
}

function invitationsFingerprint(
  invites: InviteRecord[] | undefined,
) {
  if (!invites?.length) {
    return 'none';
  }

  return invites
    .map(inviteFingerprint)
    .join('|');
}

/**
 * Keeps the inviter home screen in sync when the invitee or reward state
 * changes in a different browser/device. HomeClient can keep an older
 * completed referral visible while a newer invite is active, so the watcher
 * fingerprints the full user-facing invite list rather than only its first
 * row. This makes later claim/assignment/payment changes refresh reliably.
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
      const fingerprint =
        invitationsFingerprint(data.invites);

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
