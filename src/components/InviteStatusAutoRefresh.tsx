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

function shouldDeferReload(): boolean {
  const activeNavigation =
    document.querySelector<HTMLElement>(
      '[data-veinvite-active-tab]',
    );
  const activeTab =
    activeNavigation?.dataset
      .veinviteActiveTab;
  const modalOpen = Boolean(
    document.querySelector(
      '[role="dialog"][aria-modal="true"]',
    ),
  );

  return (
    modalOpen ||
    (activeTab !== undefined &&
      activeTab !== 'home')
  );
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
        // A full reload is still the safest way to refresh every Home-derived
        // state at once, but it must not yank someone out of Guide,
        // Leaderboard, Settings, or an open confirmation/details dialog. Keep
        // the old fingerprint so the next interval/focus check retries once
        // the user returns to Home and no modal is open.
        if (shouldDeferReload()) {
          return;
        }

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
