import {
  isRewardActionQueueStatus,
  type RewardActionItem,
  type RewardActionResponse,
} from '@/lib/notifications/rewardAction';

export const REWARD_CLAIM_UPDATED_EVENT = 'veinvite-reward-claim-updated';

export type RewardClaimReconciliation =
  | {
      kind: 'ACTION';
      action: RewardActionItem;
    }
  | {
      kind: 'ABSENT';
    }
  | {
      kind: 'AUTH_ERROR';
    }
  | {
      kind: 'UNKNOWN';
    };

type ReceiptSummary = {
  inviteCode?: unknown;
};

type ReceiptResponse = {
  receipts?: ReceiptSummary[];
};

function sameInviteCode(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

async function reconcileMissingAction(
  inviteCode: string,
): Promise<RewardClaimReconciliation> {
  try {
    const response = await fetch('/api/rewards/receipts?limit=50', {
      cache: 'no-store',
    });

    if (response.status === 401 || response.status === 403) {
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
    const paid = receipts.some((receipt) =>
      typeof receipt?.inviteCode === 'string' &&
      sameInviteCode(receipt.inviteCode, inviteCode),
    );

    // ABSENT is intentionally reserved for a missing action backed by a
    // finalized PAID receipt. If the action disappeared for any other reason,
    // fail closed as UNKNOWN instead of presenting the Claim as successful.
    return paid ? { kind: 'ABSENT' } : { kind: 'UNKNOWN' };
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

export function dispatchRewardClaimUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(REWARD_CLAIM_UPDATED_EVENT));
}
