'use client';

import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { useWallet } from '@vechain/vechain-kit';

import {
  PRODUCT_ANALYTICS_EVENT,
  type ProductAnalyticsEventDetail,
} from '@/lib/productAnalytics';
import type { InviteRecord } from '@/lib/types';

const POLL_INTERVAL_MS = 30_000;
const EVIDENCE_SYNC_INTERVAL_MS = 5 * 60_000;
const INITIAL_CHECK_FALLBACK_MS = 5_000;
const APP_READY_EVENT = 'veinvite-app-ready';
const REWARD_CLAIM_UPDATED_EVENT =
  'veinvite-reward-claim-updated';
const CLAIM_RECHECK_DELAYS_MS = [250, 1_500, 4_000] as const;

type IdleCapableWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (id: number) => void;
};

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

function hasProcessingReward(
  invites: InviteRecord[] | undefined,
): boolean {
  return Boolean(
    invites?.some(
      (invite) =>
        invite.rewardQueueStatus === 'QUEUED' ||
        invite.rewardQueueStatus === 'ASSIGNED',
    ),
  );
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
 * While an accepted referral is still active, the verified inviter also
 * provides a bounded five-minute reconciliation fallback for their own invite.
 *
 * Reward Claim is more sensitive than ordinary background refreshes. The Claim
 * request can reach the server even when the browser loses the response. We
 * therefore snapshot the current invite fingerprint when Claim starts, wake the
 * finalized-receipt tracker immediately, and perform bounded authoritative
 * re-checks only when the client reports an ambiguous network/malformed-response
 * failure. If the server state actually advanced, a full reload reconciles Home,
 * notifications, leaderboard-derived state and the Claim button from the same
 * server authority. No payout or reward state is mutated here.
 */
export function InviteStatusAutoRefresh() {
  const { account } = useWallet();
  const walletAddress =
    account?.address?.toLowerCase() ?? null;
  const lastFingerprintRef =
    useRef<string | null>(null);
  const claimStartFingerprintRef =
    useRef<string | null>(null);
  const claimRecheckTimersRef =
    useRef<number[]>([]);
  const checkingRef = useRef(false);
  const claimCheckingRef = useRef(false);
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

  const checkClaimState = useCallback(async () => {
    if (
      !walletAddress ||
      claimCheckingRef.current ||
      document.visibilityState === 'hidden'
    ) {
      return;
    }

    claimCheckingRef.current = true;

    try {
      const data = await loadInvites();
      if (!data) {
        return;
      }

      const fingerprint = invitationsFingerprint(data.invites);
      const baseline =
        claimStartFingerprintRef.current ??
        lastFingerprintRef.current;
      const processing = hasProcessingReward(data.invites);

      if (baseline === null) {
        lastFingerprintRef.current = fingerprint;
        claimStartFingerprintRef.current = fingerprint;

        // If the first reliable read already shows a processing reward, the
        // request may have committed before this component obtained a baseline.
        // Reloading is safer than re-exposing a Claim button in that ambiguity.
        if (processing) {
          window.location.reload();
        }
        return;
      }

      if (fingerprint !== baseline || processing) {
        window.location.reload();
      }
    } catch {
      // This is an ambiguity resolver only. A failed read must not convert a
      // successful on-chain/server Claim into a client-side failure decision.
    } finally {
      claimCheckingRef.current = false;
    }
  }, [loadInvites, walletAddress]);

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
              method: 'POST',
              credentials: 'same-origin',
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
    for (const timerId of claimRecheckTimersRef.current) {
      window.clearTimeout(timerId);
    }
    claimRecheckTimersRef.current = [];
    claimStartFingerprintRef.current = null;

    if (!walletAddress) {
      return;
    }

    const scheduleClaimRechecks = () => {
      for (const timerId of claimRecheckTimersRef.current) {
        window.clearTimeout(timerId);
      }
      claimRecheckTimersRef.current = CLAIM_RECHECK_DELAYS_MS.map(
        (delay) => window.setTimeout(() => {
          void checkClaimState();
        }, delay),
      );
    };

    const onProductAnalytics = (event: Event) => {
      const detail = (
        event as CustomEvent<ProductAnalyticsEventDetail>
      ).detail;

      if (!detail) {
        return;
      }

      if (detail.eventName === 'reward_claim_started') {
        claimStartFingerprintRef.current =
          lastFingerprintRef.current;
        window.dispatchEvent(
          new Event(REWARD_CLAIM_UPDATED_EVENT),
        );
        return;
      }

      if (detail.eventName === 'reward_claim_succeeded') {
        // Home and the notification center both already refresh their own
        // successful Claim state. This event only wakes the finalized receipt
        // tracker immediately so completion does not wait for its background poll.
        window.dispatchEvent(
          new Event(REWARD_CLAIM_UPDATED_EVENT),
        );
        return;
      }

      if (
        detail.eventName === 'reward_claim_failed' &&
        (
          detail.failureCode === 'network' ||
          detail.failureCode === 'malformed_response'
        )
      ) {
        scheduleClaimRechecks();
      }
    };

    window.addEventListener(
      PRODUCT_ANALYTICS_EVENT,
      onProductAnalytics as EventListener,
    );

    return () => {
      window.removeEventListener(
        PRODUCT_ANALYTICS_EVENT,
        onProductAnalytics as EventListener,
      );
      for (const timerId of claimRecheckTimersRef.current) {
        window.clearTimeout(timerId);
      }
      claimRecheckTimersRef.current = [];
    };
  }, [checkClaimState, walletAddress]);

  useEffect(() => {
    lastFingerprintRef.current = null;
    lastEvidenceSyncRef.current = null;

    if (!walletAddress) {
      return;
    }

    // HomeClient already performs the authoritative invite/link startup load.
    // Keep this independent recovery poll, but move its first duplicate invite
    // read out of the critical startup window. App-ready normally triggers the
    // check during an idle browser slice; the bounded fallback preserves the
    // old recovery behavior if Home never reaches app-ready.
    const idleWindow = window as IdleCapableWindow;
    let initialCheckStarted = false;
    let initialFallbackId: number | null = null;
    let initialIdleId: number | null = null;

    const startInitialCheck = () => {
      if (initialCheckStarted) {
        return;
      }

      initialCheckStarted = true;

      if (initialFallbackId !== null) {
        window.clearTimeout(initialFallbackId);
        initialFallbackId = null;
      }

      if (
        typeof idleWindow.requestIdleCallback ===
        'function'
      ) {
        initialIdleId =
          idleWindow.requestIdleCallback(
            () => {
              initialIdleId = null;
              void check();
            },
            { timeout: 1_500 },
          );
        return;
      }

      initialFallbackId = window.setTimeout(
        () => {
          initialFallbackId = null;
          void check();
        },
        0,
      );
    };

    if (
      document.documentElement.dataset
        .veinviteAppReady === 'true'
    ) {
      startInitialCheck();
    } else {
      window.addEventListener(
        APP_READY_EVENT,
        startInitialCheck,
        { once: true },
      );
      initialFallbackId = window.setTimeout(
        startInitialCheck,
        INITIAL_CHECK_FALLBACK_MS,
      );
    }

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
      window.removeEventListener(
        APP_READY_EVENT,
        startInitialCheck,
      );
      if (initialFallbackId !== null) {
        window.clearTimeout(initialFallbackId);
      }
      if (
        initialIdleId !== null &&
        typeof idleWindow.cancelIdleCallback ===
          'function'
      ) {
        idleWindow.cancelIdleCallback(initialIdleId);
      }
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
