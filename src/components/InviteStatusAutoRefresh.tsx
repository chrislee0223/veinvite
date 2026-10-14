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
const INITIAL_CHECK_FALLBACK_MS = 5_000;
const APP_READY_EVENT = 'veinvite-app-ready';
const HOME_REFRESH_REQUESTED_EVENT = 'veinvite-home-data-refresh-requested';
const HOME_REFRESH_SETTLED_EVENT = 'veinvite-home-data-refresh-settled';
const REFRESH_ACK_TIMEOUT_MS = 45_000;

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
 * This complements (rather than replaces) the daily scheduled worker and the
 * invitee page's own polling, so a closed invitee tab or one missed scheduler
 * run cannot leave active progress stale indefinitely.
 */
export function InviteStatusAutoRefresh() {
  const { account } = useWallet();
  const walletAddress =
    account?.address?.toLowerCase() ?? null;
  const activeWalletRef =
    useRef<string | null>(walletAddress);
  // Keep the latest wallet visible to already-running promises immediately.
  // Waiting for an effect cleanup leaves a small window where a stale request
  // can finish after React has rendered the next wallet.
  activeWalletRef.current = walletAddress;
  const lastFingerprintRef =
    useRef<string | null>(null);
  const pendingRefreshRef = useRef<{
    fingerprint: string;
    requestedAt: number;
  } | null>(null);
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
        signal: AbortSignal.timeout(10_000),
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

    const requestWallet = walletAddress;
    checkingRef.current = true;

    try {
      let data = await loadInvites();

      if (
        !data ||
        activeWalletRef.current !== requestWallet
      ) {
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
              signal: AbortSignal.timeout(10_000),
            },
          );

          if (activeWalletRef.current !== requestWallet) {
            return;
          }

          if (syncResponse.ok) {
            const refreshed =
              await loadInvites();
            if (activeWalletRef.current !== requestWallet) {
              return;
            }
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

      if (activeWalletRef.current !== requestWallet) {
        return;
      }

      const fingerprint =
        invitationsFingerprint(data.invites);

      if (lastFingerprintRef.current === null) {
        lastFingerprintRef.current = fingerprint;
        return;
      }

      if (lastFingerprintRef.current !== fingerprint) {
        // Do not acknowledge a change until Home actually loaded it. A failed
        // fetch must be retried on a later poll instead of being forgotten.
        const pending = pendingRefreshRef.current;
        if (
          pending?.fingerprint === fingerprint &&
          now - pending.requestedAt < REFRESH_ACK_TIMEOUT_MS
        ) {
          return;
        }
        pendingRefreshRef.current = { fingerprint, requestedAt: now };
        window.dispatchEvent(
          new CustomEvent(HOME_REFRESH_REQUESTED_EVENT, {
            detail: {
              source: 'invite-poll',
              walletAddress: requestWallet,
              fingerprint,
            },
          }),
        );
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
    pendingRefreshRef.current = null;
    lastEvidenceSyncRef.current = null;
    checkingRef.current = false;

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

    const onHomeRefreshSettled = (event: Event) => {
      const detail = (event as CustomEvent<{
        walletAddress?: string;
        fingerprint?: string;
        success?: boolean;
      }>).detail;
      const pending = pendingRefreshRef.current;
      if (
        !pending ||
        activeWalletRef.current !== walletAddress ||
        detail?.walletAddress !== walletAddress ||
        detail.fingerprint !== pending.fingerprint
      ) {
        return;
      }
      pendingRefreshRef.current = null;
      if (detail.success === true) {
        lastFingerprintRef.current = pending.fingerprint;
      }
      // On failure the next 30-second check re-requests the latest state.
    };
    window.addEventListener(HOME_REFRESH_SETTLED_EVENT, onHomeRefreshSettled);

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
        HOME_REFRESH_SETTLED_EVENT,
        onHomeRefreshSettled,
      );
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
