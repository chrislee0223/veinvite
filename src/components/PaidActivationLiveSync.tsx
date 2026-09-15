'use client';

import { useCallback, useEffect, useRef } from 'react';

import {
  subscribeRewardClaimUpdated,
} from '@/lib/rewards/rewardClaimClient';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

const PAID_ACTIVATION_UPDATED_EVENT = 'veinvite-paid-activation-updated';
const CLAIM_POLL_INTERVAL_MS = 2_000;
const CLAIM_POLL_TIMEOUT_MS = 120_000;
const BACKGROUND_POLL_INTERVAL_MS = 30_000;

type ReceiptResponse = {
  receipts?: RewardReceipt[];
};

type ReceiptSnapshot = {
  latestReceiptId: string | null;
  receipts: RewardReceipt[];
};

async function readReceiptSnapshot(): Promise<ReceiptSnapshot | null> {
  const response = await fetch('/api/rewards/receipts?limit=50', {
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as ReceiptResponse;
  const receipts = Array.isArray(body.receipts) ? body.receipts : [];

  return {
    latestReceiptId: receipts[0]?.id ?? null,
    receipts,
  };
}

function sameInviteCode(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

export function PaidActivationLiveSync() {
  const latestReceiptIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const targetInviteCodeRef = useRef<string | null>(null);
  const claimPollTimerRef = useRef<number | null>(null);
  const claimPollDeadlineRef = useRef(0);
  const reloadRequestedRef = useRef(false);
  const readInFlightRef = useRef<Promise<ReceiptSnapshot | null> | null>(null);

  const readLatest = useCallback(async () => {
    let request = readInFlightRef.current;
    if (!request) {
      request = readReceiptSnapshot();
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

  const requestPaidReload = useCallback((latestReceiptId: string | null) => {
    if (reloadRequestedRef.current) return false;

    if (latestReceiptId) {
      latestReceiptIdRef.current = latestReceiptId;
    }
    reloadRequestedRef.current = true;

    window.dispatchEvent(new Event(PAID_ACTIVATION_UPDATED_EVENT));

    // A reward receipt exists only after finalized on-chain settlement. Reload
    // once at that boundary so the Home reward card, rank, impact totals and
    // notifications all consume the same finalized PAID evidence.
    window.location.reload();
    return true;
  }, []);

  const applyLatestReceipt = useCallback(async (): Promise<boolean> => {
    const snapshot = await readLatest();
    if (!snapshot) return false;

    const targetInviteCode = targetInviteCodeRef.current;
    if (targetInviteCode) {
      const targetReceipt = snapshot.receipts.find(
        (receipt) =>
          typeof receipt.inviteCode === 'string' &&
          sameInviteCode(receipt.inviteCode, targetInviteCode),
      );

      // Targeted receipt evidence wins even if the initial background baseline
      // has not finished yet. This closes the race where a very fast payout
      // could otherwise become the baseline and never be recognized as new.
      if (targetReceipt) {
        targetInviteCodeRef.current = null;
        return requestPaidReload(snapshot.latestReceiptId ?? targetReceipt.id);
      }
    }

    if (!initializedRef.current) {
      latestReceiptIdRef.current = snapshot.latestReceiptId;
      initializedRef.current = true;
      return false;
    }

    if (
      !snapshot.latestReceiptId ||
      snapshot.latestReceiptId === latestReceiptIdRef.current ||
      reloadRequestedRef.current
    ) {
      return false;
    }

    return requestPaidReload(snapshot.latestReceiptId);
  }, [readLatest, requestPaidReload]);

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
        if (await applyLatestReceipt()) {
          return;
        }
      } catch {
        // The normal notification/reconcile fallback remains available. A
        // temporary receipt read failure must never affect payout execution.
      }

      if (Date.now() < claimPollDeadlineRef.current) {
        claimPollTimerRef.current = window.setTimeout(
          poll,
          CLAIM_POLL_INTERVAL_MS,
        );
      }
    };

    void poll();
  }, [applyLatestReceipt, stopClaimPolling]);

  useEffect(() => {
    void applyLatestReceipt();

    const unsubscribeClaimUpdates = subscribeRewardClaimUpdated((signal) => {
      if (signal.inviteCode) {
        targetInviteCodeRef.current = signal.inviteCode;
      }
      claimPollDeadlineRef.current = Date.now() + CLAIM_POLL_TIMEOUT_MS;
      scheduleClaimPoll();
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void applyLatestReceipt();
      }
    };

    const backgroundTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void applyLatestReceipt();
      }
    }, BACKGROUND_POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsubscribeClaimUpdates();
      stopClaimPolling();
      window.clearInterval(backgroundTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [applyLatestReceipt, scheduleClaimPoll, stopClaimPolling]);

  return null;
}
