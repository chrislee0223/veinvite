'use client';

import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { useWallet } from '@vechain/vechain-kit';

import type { InviteRecord } from '@/lib/types';

const POLL_INTERVAL_MS = 30_000;
const EVIDENCE_SYNC_INTERVAL_MS = 5 * 60_000;

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

function shouldDeferHomeRefresh(): boolean {
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

function evidenceSyncCandidate(
  invites: InviteRecord[] | undefined,
): InviteRecord | null {
  return invites?.find(
    (invite) =>
      invite.status === 'ACTIVATING' ||
      invite.status === 'UNDER_REVIEW',
  ) ?? null;
}

/**
 * Keeps the inviter home screen in sync when invitee/reward state changes in a
 * different browser or device. A lightweight invite-list check runs every 30s.
 * While an accepted referral is still active, the inviter also provides a
 * bounded five-minute fallback that asks the existing public invite endpoint to
 * reconcile chain evidence. This complements (rather than replaces) the daily
 * scheduled worker and the invitee page's own polling, so one missed scheduler
 * run cannot leave active progress stale indefinitely.
 */
export function InviteStatusAutoRefresh() {
  const { account } = useWallet();
  const walletAddress =
    account?.address?.toLowerCase() ?? null;
  const lastFingerprintRef =
    useRef<string | null>(null);
  const checkingRef = useRef(false);
  const lastEvidenceSyncRef =
    useRef<{
      code: string;
      at: number;
    } | null>(null);

  const loadInvites = useCallback(async () => {
    if (!walletAddress) {
      return null;
    }

    const response = await fetch(
      `/api/invites?inviter=${encodeURIComponent(
        walletAddress,
      )}`,
      {
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as {
      invites?: InviteRecord[];
    };
  }, [walletAddress]);

  const check = useCallback(async () => {
    if (
      !walletAddress ||
      checkingRef.current ||
      document.visibilityState === 'hidden' ||
      shouldDeferHomeRefresh()
    ) {
      return;
    }

    checkingRef.current = true;

    try {
      let data = await loadInvites();

      if (!data) {
        return;
      }

      const candidate =
        evidenceSyncCandidate(data.invites);
      const previousSync =
        lastEvidenceSyncRef.current;
      const now = Date.now();
      const shouldSyncEvidence =
        Boolean(candidate) &&
        (
          previousSync?.code !==
            candidate?.code ||
          !previousSync ||
          now - previousSync.at >=
            EVIDENCE_SYNC_INTERVAL_MS
        );

      if (candidate && shouldSyncEvidence) {
        // Record the attempt before the request so a temporary node/API failure
        // cannot create a tight retry loop on focus/visibility events.
        lastEvidenceSyncRef.current = {
          code: candidate.code,
          at: now,
        };

        try {
          const syncResponse = await fetch(
            `/api/invites/${encodeURIComponent(
              candidate.code,
            )}`,
            {
              cache: 'no-store',
            },
          );

          if (syncResponse.ok) {
            const refreshed =
              await loadInvites();
            if (refreshed) {
              data = refreshed;
            }
          }
        } catch {
          // This is a best-effort fallback. The regular scheduler and invitee
          // polling remain available, and another fallback attempt is allowed
          // after the bounded interval.
        }
      }

      const fingerprint =
        invitationsFingerprint(data.invites);

      if (lastFingerprintRef.current === null) {
        lastFingerprintRef.current = fingerprint;
        return;
      }

      if (lastFingerprintRef.current !== fingerprint) {
        // A full reload remains the safest way to refresh every Home-derived
        // state at once. Checks pause while another tab/modal is active so the
        // user is not pulled out of Guide, Leaderboard, Settings, or a dialog.
        window.location.reload();
      }
    } catch {
      // HomeClient remains usable when a background refresh fails. The next
      // interval/focus event will retry without surfacing a disruptive toast.
    } finally {
      checkingRef.current = false;
    }
  }, [
    loadInvites,
    walletAddress,
  ]);

  useEffect(() => {
    lastFingerprintRef.current = null;
    lastEvidenceSyncRef.current = null;

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
