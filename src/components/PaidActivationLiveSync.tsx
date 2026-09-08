'use client';

import { useCallback, useEffect, useRef } from 'react';

import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

const REWARD_CLAIM_UPDATED_EVENT = 'veinvite-reward-claim-updated';
const PAID_ACTIVATION_UPDATED_EVENT = 'veinvite-paid-activation-updated';
const CLAIM_POLL_INTERVAL_MS = 2_000;
const CLAIM_POLL_TIMEOUT_MS = 120_000;
const BACKGROUND_POLL_INTERVAL_MS = 30_000;

type ReceiptResponse = {
  receipts?: RewardReceipt[];
};

async function readLatestReceiptId(): Promise<string | null> {
  const response = await fetch('/api/rewards/receipts?limit=1', {
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as ReceiptResponse;
  const latest = Array.isArray(body.receipts) ? body.receipts[0] : null;
  return latest?.id ?? null;
}

export function PaidActivationLiveSync() {
  const latestReceiptIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const claimPollTimerRef = useRef<number | null>(null);
  const claimPollDeadlineRef = useRef(0);
  const reloadRequestedRef = useRef(false);
  const readInFlightRef = useRef<Promise<string | null> | null>(null);

  const readLatest = useCallback(async () => {
    let request = readInFlightRef.current;
    if (!request) {
      request = readLatestReceiptId();
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

  const applyLatestReceipt = useCallback(async (): Promise<boolean> => {
    const latestReceiptId = await readLatest();

    if (!initializedRef.current) {
      latestReceiptIdRef.current = latestReceiptId;
      initializedRef.current = true;
      return false;
    }

    if (
      !latestReceiptId ||
      latestReceiptId === latestReceiptIdRef.current ||
      reloadRequestedRef.current
    ) {
      return false;
    }

    latestReceiptIdRef.current = latestReceiptId;
    reloadRequestedRef.current = true;

    window.dispatchEvent(new Event(PAID_ACTIVATION_UPDATED_EVENT));

    // A finalized reward receipt is the single public activation source of truth.
    // Reload once so every surface (impact totals, inviter rank, country rank and
    // notifications) reads the same freshly-finalized receipt without waiting for
    // independent client caches to expire.
    window.location.reload();
    return true;
  }, [readLatest]);

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
  }, [applyLatestReceipt, stopClaimPolling]);

  useEffect(() => {
    void applyLatestReceipt();

    const onClaimUpdated = () => {
      claimPollDeadlineRef.current = Date.now() + CLAIM_POLL_TIMEOUT_MS;
      scheduleClaimPoll();
    };

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

    window.addEventListener(REWARD_CLAIM_UPDATED_EVENT, onClaimUpdated);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopClaimPolling();
      window.clearInterval(backgroundTimer);
      window.removeEventListener(REWARD_CLAIM_UPDATED_EVENT, onClaimUpdated);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [applyLatestReceipt, scheduleClaimPoll, stopClaimPolling]);

  return null;
}
