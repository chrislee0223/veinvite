'use client';

import { useCallback, useEffect, useRef } from 'react';

import {
  subscribeRewardClaimUpdated,
} from '@/lib/rewards/rewardClaimClient';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

const PAID_ACTIVATION_UPDATED_EVENT = 'veinvite-paid-activation-updated';
const CLAIM_POLL_INTERVAL_MS = 3_000;
const CLAIM_POLL_TIMEOUT_MS = 180_000;
const BACKGROUND_POLL_INTERVAL_MS = 30_000;
const RECEIPT_HISTORY_LIMIT = 20;

type ReceiptResponse = {
  receipts?: RewardReceipt[];
};

async function readRecentReceipts(): Promise<RewardReceipt[]> {
  const response = await fetch(
    `/api/rewards/receipts?limit=${RECEIPT_HISTORY_LIMIT}`,
    {
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    return [];
  }

  const body = (await response.json()) as ReceiptResponse;
  return Array.isArray(body.receipts)
    ? body.receipts
    : [];
}

export function PaidActivationLiveSync() {
  const latestReceiptIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const pendingInviteCodesRef = useRef<Set<string>>(new Set());
  const claimPollTimerRef = useRef<number | null>(null);
  const claimPollDeadlineRef = useRef(0);
  const reloadRequestedRef = useRef(false);
  const readInFlightRef = useRef<Promise<RewardReceipt[]> | null>(null);

  const readReceipts = useCallback(async () => {
    let request = readInFlightRef.current;
    if (!request) {
      request = readRecentReceipts();
      readInFlightRef.current = request;
    }

    try {
      return await request;
    } finally {
      if (readInFlightRef.current === request) {
        readInFlightRef.current = null;
      }
    }
  }, []);

  const requestFreshPaidState = useCallback(() => {
    if (reloadRequestedRef.current) {
      return false;
    }

    reloadRequestedRef.current = true;
    window.dispatchEvent(new Event(PAID_ACTIVATION_UPDATED_EVENT));

    // A reward receipt exists only after immutable on-chain evidence reaches the
    // finalized settlement boundary. Reload once there so impact totals, inviter
    // rank, country rank and reward notifications all read the same paid state.
    window.location.reload();
    return true;
  }, []);

  const applyReceipts = useCallback(async (): Promise<boolean> => {
    const receipts = await readReceipts();
    const latestReceiptId = receipts[0]?.id ?? null;

    const matchedPendingReceipt = receipts.find((receipt) =>
      pendingInviteCodesRef.current.has(
        receipt.inviteCode.trim().toUpperCase(),
      ),
    );

    // Match a specific claimed invite before establishing the generic baseline.
    // This closes the narrow mount/Claim race where an extremely fast receipt
    // could otherwise be mistaken for the initial latest receipt and swallowed.
    if (matchedPendingReceipt) {
      pendingInviteCodesRef.current.delete(
        matchedPendingReceipt.inviteCode.trim().toUpperCase(),
      );
      latestReceiptIdRef.current = latestReceiptId;
      initializedRef.current = true;
      return requestFreshPaidState();
    }

    if (!initializedRef.current) {
      latestReceiptIdRef.current = latestReceiptId;
      initializedRef.current = true;
      return false;
    }

    if (
      !latestReceiptId ||
      latestReceiptId === latestReceiptIdRef.current
    ) {
      return false;
    }

    latestReceiptIdRef.current = latestReceiptId;
    return requestFreshPaidState();
  }, [readReceipts, requestFreshPaidState]);

  const stopClaimPolling = useCallback(() => {
    if (claimPollTimerRef.current !== null) {
      window.clearTimeout(claimPollTimerRef.current);
      claimPollTimerRef.current = null;
    }
  }, []);

  const scheduleClaimPoll = useCallback(() => {
    stopClaimPolling();

    const poll = async () => {
      if (document.visibilityState !== 'visible') {
        if (Date.now() < claimPollDeadlineRef.current) {
          claimPollTimerRef.current = window.setTimeout(
            poll,
            CLAIM_POLL_INTERVAL_MS,
          );
        }
        return;
      }

      try {
        if (await applyReceipts()) {
          return;
        }
      } catch {
        // The normal notification/reconcile fallback remains available. A
        // temporary receipt read failure must not affect the core app.
      }

      if (Date.now() < claimPollDeadlineRef.current) {
        claimPollTimerRef.current = window.setTimeout(
          poll,
          CLAIM_POLL_INTERVAL_MS,
        );
      }
    };

    void poll();
  }, [applyReceipts, stopClaimPolling]);

  useEffect(() => {
    void applyReceipts();

    const unsubscribeClaimUpdates =
      subscribeRewardClaimUpdated((inviteCode) => {
        if (inviteCode) {
          pendingInviteCodesRef.current.add(inviteCode);
        }
        claimPollDeadlineRef.current =
          Date.now() + CLAIM_POLL_TIMEOUT_MS;
        scheduleClaimPoll();
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void applyReceipts();
      }
    };

    const backgroundTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void applyReceipts();
      }
    }, BACKGROUND_POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopClaimPolling();
      unsubscribeClaimUpdates();
      window.clearInterval(backgroundTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [applyReceipts, scheduleClaimPoll, stopClaimPolling]);

  return null;
}
