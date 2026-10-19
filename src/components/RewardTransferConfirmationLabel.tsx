'use client';

import { useEffect, useState } from 'react';

import type {
  RewardActionResponse,
} from '@/lib/notifications/rewardAction';
import {
  REWARD_ACTION_PENDING_TRANSFER_POLL_MS,
  REWARD_ACTION_IDLE_POLL_MS,
} from '@/lib/notifications/rewardActionPolling';
import {
  notifyRewardClaimSessionInvalid,
} from '@/lib/rewards/rewardClaimClient';

const FAST_CONFIRMATION_WINDOW_MS = 2 * 60 * 1000;
const TX_ID_PATTERN = /^0x[0-9a-f]{64}$/iu;

/**
 * Read-only early feedback for an already-claimed B3TR transfer.
 * Only the server's manifest-verified canonical broadcast marker is trusted.
 * This never creates a PAID receipt, advances a payout, or opens X sharing.
 */
export function RewardTransferConfirmationLabel({
  inviteCode,
  wallet,
  queuedText,
  finalCheckText,
}: {
  inviteCode: string;
  wallet: string;
  queuedText: string;
  finalCheckText: string;
}) {
  const identity = `${wallet.toLowerCase()}:${inviteCode.toUpperCase()}`;
  const [confirmedIdentity, setConfirmedIdentity] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet || !inviteCode) return;

    let disposed = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    const scheduleNext = () => {
      if (disposed || timer !== null) return;

      // Poll only briefly at 5s while a freshly claimed transfer appears on
      // chain; fall back to the existing 60s cadence to limit DB/API costs.
      const interval = Date.now() - startedAt < FAST_CONFIRMATION_WINDOW_MS
        ? REWARD_ACTION_PENDING_TRANSFER_POLL_MS
        : REWARD_ACTION_IDLE_POLL_MS;

      timer = setTimeout(() => {
        timer = null;
        void poll();
      }, interval);
    };

    const poll = async () => {
      if (disposed || inFlight) return;
      if (document.visibilityState !== 'visible') {
        scheduleNext();
        return;
      }

      inFlight = true;
      let confirmed = false;
      let terminalAuth = false;
      try {
        const response = await fetch('/api/notifications/reward-actions', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: AbortSignal.timeout(8_000),
        });

        if (response.status === 401 || response.status === 403) {
          terminalAuth = true;
          notifyRewardClaimSessionInvalid();
          return;
        }

        if (response.ok) {
          const body = (await response.json()) as RewardActionResponse;

          // Responses from a previous wallet session must never mark a new
          // wallet's payment as confirmed after a rapid wallet switch.
          if (body.walletAddress?.toLowerCase() !== wallet.toLowerCase()) {
            return;
          }

          const action = body.actions?.find(
            (candidate) => candidate.inviteCode === inviteCode.toUpperCase(),
          );
          confirmed = Boolean(
            action?.status !== 'AWAITING_CLAIM' &&
            action?.broadcastConfirmedAt &&
            action?.txId &&
            TX_ID_PATTERN.test(action.txId),
          );

          if (confirmed && !disposed) {
            setConfirmedIdentity(identity);
          }
        }
      } catch {
        // Temporary read failures must never affect transfer authorization.
      } finally {
        inFlight = false;
        if (!confirmed && !terminalAuth) scheduleNext();
      }
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || disposed) return;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      void poll();
    };

    void poll();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [identity, inviteCode, wallet]);

  const confirmed = confirmedIdentity === identity;

  return (
    <span className="processingBadge" role="status" aria-live="polite">
      {confirmed
        ? `✓ B3TR · ${finalCheckText}`
        : queuedText}
    </span>
  );
}
