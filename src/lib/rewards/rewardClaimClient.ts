'use client';

import {
  isRewardActionQueueStatus,
  type RewardActionItem,
  type RewardActionResponse,
} from '@/lib/notifications/rewardAction';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

export const REWARD_CLAIM_UPDATED_EVENT = 'veinvite-reward-claim-updated';
export const WALLET_SESSION_INVALID_EVENT = 'veinvite-wallet-session-invalid';

const REWARD_CLAIM_SYNC_CHANNEL = 'veinvite-reward-claim-sync-v1';
const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const DEFAULT_RECONCILE_ATTEMPTS = 3;
const DEFAULT_RECONCILE_DELAY_MS = 450;

export type RewardClaimReconciliation =
  | {
      kind: 'ACTION';
      action: RewardActionItem;
    }
  | {
      kind: 'ABSENT';
      receipt: RewardReceipt;
    }
  | {
      kind: 'AUTH_ERROR';
    }
  | {
      kind: 'UNKNOWN';
    };

export type RewardClaimSignal = {
  inviteCode: string | null;
  sentAt: number;
};

type ReceiptResponse = {
  receipts?: RewardReceipt[];
};

function normalizeInviteCode(value: unknown): string | null {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();

  return INVITE_CODE_PATTERN.test(normalized)
    ? normalized
    : null;
}

function sameInviteCode(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

function parseRewardClaimSignal(value: unknown): RewardClaimSignal | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const raw = value as {
    inviteCode?: unknown;
    sentAt?: unknown;
  };
  const inviteCode =
    raw.inviteCode == null
      ? null
      : normalizeInviteCode(raw.inviteCode);

  if (raw.inviteCode != null && !inviteCode) {
    return null;
  }

  return {
    inviteCode,
    sentAt:
      typeof raw.sentAt === 'number' && Number.isFinite(raw.sentAt)
        ? raw.sentAt
        : Date.now(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function notifyRewardClaimSessionInvalid(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WALLET_SESSION_INVALID_EVENT));
}

async function reconcileMissingAction(
  inviteCode: string,
): Promise<RewardClaimReconciliation> {
  try {
    const response = await fetch('/api/rewards/receipts?limit=50', {
      cache: 'no-store',
    });

    if (response.status === 401 || response.status === 403) {
      notifyRewardClaimSessionInvalid();
      return { kind: 'AUTH_ERROR' };
    }

    if (!response.ok) {
      return { kind: 'UNKNOWN' };
    }

    let body: ReceiptResponse;
    try {
      body = (await response.json()) as ReceiptResponse;
    } catch {
      return { kind: 'UNKNOWN' };
    }

    const receipts = Array.isArray(body.receipts) ? body.receipts : [];
    const paid = receipts.find((receipt) =>
      typeof receipt?.inviteCode === 'string' &&
      sameInviteCode(receipt.inviteCode, inviteCode),
    );

    // ABSENT is intentionally reserved for a missing action backed by a
    // finalized PAID receipt. If the action disappeared for any other reason,
    // fail closed as UNKNOWN instead of presenting the Claim as successful.
    return paid
      ? { kind: 'ABSENT', receipt: paid }
      : { kind: 'UNKNOWN' };
  } catch {
    return { kind: 'UNKNOWN' };
  }
}

export async function reconcileRewardClaimState(
  inviteCode: string,
): Promise<RewardClaimReconciliation> {
  try {
    const response = await fetch('/api/notifications/reward-actions', {
      cache: 'no-store',
    });

    if (response.status === 401 || response.status === 403) {
      notifyRewardClaimSessionInvalid();
      return { kind: 'AUTH_ERROR' };
    }

    if (!response.ok) {
      return { kind: 'UNKNOWN' };
    }

    let body: RewardActionResponse;
    try {
      body = (await response.json()) as RewardActionResponse;
    } catch {
      return { kind: 'UNKNOWN' };
    }

    const actions = Array.isArray(body.actions) ? body.actions : [];
    const action = actions.find((candidate) =>
      typeof candidate?.inviteCode === 'string' &&
      sameInviteCode(candidate.inviteCode, inviteCode) &&
      isRewardActionQueueStatus(candidate.status),
    );

    if (!action) {
      // The action endpoint intentionally omits finalized PAID rewards, but it
      // can also omit rewards that are no longer claimable. Never equate
      // disappearance with success: require an actual finalized receipt.
      return reconcileMissingAction(inviteCode);
    }

    return { kind: 'ACTION', action };
  } catch {
    return { kind: 'UNKNOWN' };
  }
}

export async function reconcileRewardClaimStateWithRetry(
  inviteCode: string,
  options: {
    attempts?: number;
    delayMs?: number;
  } = {},
): Promise<RewardClaimReconciliation> {
  const attempts = Math.max(
    1,
    Math.min(5, Math.trunc(options.attempts ?? DEFAULT_RECONCILE_ATTEMPTS)),
  );
  const delayMs = Math.max(
    0,
    Math.min(2_000, Math.trunc(options.delayMs ?? DEFAULT_RECONCILE_DELAY_MS)),
  );

  let last: RewardClaimReconciliation = { kind: 'UNKNOWN' };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await reconcileRewardClaimState(inviteCode);
    if (last.kind !== 'UNKNOWN') {
      return last;
    }

    if (attempt + 1 < attempts && delayMs > 0) {
      await delay(delayMs);
    }
  }

  return last;
}

export function dispatchRewardClaimUpdated(inviteCode?: string): void {
  if (typeof window === 'undefined') return;

  const detail: RewardClaimSignal = {
    inviteCode: normalizeInviteCode(inviteCode) ?? null,
    sentAt: Date.now(),
  };

  window.dispatchEvent(
    new CustomEvent<RewardClaimSignal>(
      REWARD_CLAIM_UPDATED_EVENT,
      { detail },
    ),
  );

  if (typeof BroadcastChannel === 'undefined') return;

  const channel = new BroadcastChannel(REWARD_CLAIM_SYNC_CHANNEL);
  try {
    channel.postMessage(detail);
  } finally {
    channel.close();
  }
}

export function subscribeRewardClaimUpdated(
  listener: (signal: RewardClaimSignal) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const onWindowEvent = (event: Event) => {
    const signal = parseRewardClaimSignal(
      (event as CustomEvent<unknown>).detail,
    ) ?? {
      inviteCode: null,
      sentAt: Date.now(),
    };
    listener(signal);
  };

  window.addEventListener(REWARD_CLAIM_UPDATED_EVENT, onWindowEvent);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(REWARD_CLAIM_SYNC_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const signal = parseRewardClaimSignal(event.data);
      if (signal) listener(signal);
    };
  }

  return () => {
    window.removeEventListener(REWARD_CLAIM_UPDATED_EVENT, onWindowEvent);
    channel?.close();
  };
}
