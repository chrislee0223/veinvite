'use client';

import type {
  RewardActionItem,
  RewardActionResponse,
} from '@/lib/notifications/rewardAction';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

export const REWARD_CLAIM_UPDATED_EVENT =
  'veinvite-reward-claim-updated';
export const WALLET_SESSION_INVALID_EVENT =
  'veinvite-wallet-session-invalid';

const REWARD_CLAIM_SYNC_CHANNEL =
  'veinvite-reward-claim-sync-v1';
const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;

type ReceiptResponse = {
  receipts?: RewardReceipt[];
};

export type RewardClaimAuthoritativeState =
  | 'AWAITING_CLAIM'
  | 'PROCESSING'
  | 'PAID'
  | 'UNKNOWN';

export type RewardClaimReconciliation = {
  state: RewardClaimAuthoritativeState;
  action: RewardActionItem | null;
  receipt: RewardReceipt | null;
  sessionInvalid: boolean;
};

type RewardClaimSignal = {
  inviteCode: string;
  sentAt: number;
};

function normalizeInviteCode(value: unknown): string | null {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();

  return INVITE_CODE_PATTERN.test(normalized)
    ? normalized
    : null;
}

async function readJsonSafely(
  response: Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function notifySessionInvalid() {
  window.dispatchEvent(
    new Event(WALLET_SESSION_INVALID_EVENT),
  );
}

export function signalRewardClaimUpdated(
  rawInviteCode: string,
) {
  const inviteCode = normalizeInviteCode(rawInviteCode);
  if (!inviteCode) return;

  const detail: RewardClaimSignal = {
    inviteCode,
    sentAt: Date.now(),
  };

  window.dispatchEvent(
    new CustomEvent<RewardClaimSignal>(
      REWARD_CLAIM_UPDATED_EVENT,
      { detail },
    ),
  );

  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  const channel = new BroadcastChannel(
    REWARD_CLAIM_SYNC_CHANNEL,
  );
  try {
    channel.postMessage(detail);
  } finally {
    channel.close();
  }
}

export function subscribeRewardClaimUpdated(
  listener: (inviteCode: string | null) => void,
): () => void {
  const onWindowEvent = (event: Event) => {
    const detail =
      (event as CustomEvent<unknown>).detail;
    const inviteCode =
      typeof detail === 'object' &&
      detail !== null &&
      'inviteCode' in detail
        ? normalizeInviteCode(
            (detail as { inviteCode?: unknown }).inviteCode,
          )
        : null;

    listener(inviteCode);
  };

  window.addEventListener(
    REWARD_CLAIM_UPDATED_EVENT,
    onWindowEvent,
  );

  let channel: BroadcastChannel | null = null;

  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(
      REWARD_CLAIM_SYNC_CHANNEL,
    );
    channel.addEventListener(
      'message',
      (event: MessageEvent<unknown>) => {
        const data = event.data;
        const inviteCode =
          typeof data === 'object' &&
          data !== null &&
          'inviteCode' in data
            ? normalizeInviteCode(
                (data as { inviteCode?: unknown }).inviteCode,
              )
            : null;

        if (inviteCode) {
          listener(inviteCode);
        }
      },
    );
  }

  return () => {
    window.removeEventListener(
      REWARD_CLAIM_UPDATED_EVENT,
      onWindowEvent,
    );
    channel?.close();
  };
}

export async function reconcileRewardClaim(
  rawInviteCode: string,
): Promise<RewardClaimReconciliation> {
  const inviteCode = normalizeInviteCode(rawInviteCode);

  if (!inviteCode) {
    return {
      state: 'UNKNOWN',
      action: null,
      receipt: null,
      sessionInvalid: false,
    };
  }

  const [actionsResult, receiptsResult] =
    await Promise.allSettled([
      fetch('/api/notifications/reward-actions', {
        cache: 'no-store',
      }),
      fetch('/api/rewards/receipts?limit=50', {
        cache: 'no-store',
      }),
    ]);

  const actionsResponse =
    actionsResult.status === 'fulfilled'
      ? actionsResult.value
      : null;
  const receiptsResponse =
    receiptsResult.status === 'fulfilled'
      ? receiptsResult.value
      : null;

  const sessionInvalid =
    actionsResponse?.status === 401 ||
    receiptsResponse?.status === 401;

  if (sessionInvalid) {
    notifySessionInvalid();
    return {
      state: 'UNKNOWN',
      action: null,
      receipt: null,
      sessionInvalid: true,
    };
  }

  const [actionsBody, receiptsBody] =
    await Promise.all([
      actionsResponse?.ok
        ? readJsonSafely(actionsResponse)
        : Promise.resolve(null),
      receiptsResponse?.ok
        ? readJsonSafely(receiptsResponse)
        : Promise.resolve(null),
    ]);

  const actions =
    actionsBody &&
    typeof actionsBody === 'object' &&
    Array.isArray(
      (actionsBody as RewardActionResponse).actions,
    )
      ? (actionsBody as RewardActionResponse).actions ?? []
      : [];
  const receipts =
    receiptsBody &&
    typeof receiptsBody === 'object' &&
    Array.isArray(
      (receiptsBody as ReceiptResponse).receipts,
    )
      ? (receiptsBody as ReceiptResponse).receipts ?? []
      : [];

  const receipt =
    receipts.find(
      (item) =>
        normalizeInviteCode(item.inviteCode) === inviteCode,
    ) ?? null;

  if (receipt) {
    return {
      state: 'PAID',
      action: null,
      receipt,
      sessionInvalid: false,
    };
  }

  const action =
    actions.find(
      (item) =>
        normalizeInviteCode(item.inviteCode) === inviteCode,
    ) ?? null;

  if (
    action?.status === 'QUEUED' ||
    action?.status === 'ASSIGNED'
  ) {
    return {
      state: 'PROCESSING',
      action,
      receipt: null,
      sessionInvalid: false,
    };
  }

  if (action?.status === 'AWAITING_CLAIM') {
    return {
      state: 'AWAITING_CLAIM',
      action,
      receipt: null,
      sessionInvalid: false,
    };
  }

  return {
    state: 'UNKNOWN',
    action: null,
    receipt: null,
    sessionInvalid: false,
  };
}
