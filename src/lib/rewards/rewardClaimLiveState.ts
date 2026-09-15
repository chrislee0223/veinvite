import type {
  RewardActionItem,
  RewardActionResponse,
} from '@/lib/notifications/rewardAction';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

export const REWARD_CLAIM_UPDATED_EVENT =
  'veinvite-reward-claim-updated';

type RewardReceiptResponse = {
  receipts?: RewardReceipt[];
  error?: string;
};

export type RewardClaimLiveState =
  | {
      kind: 'awaiting';
      action: RewardActionItem;
    }
  | {
      kind: 'processing';
      action: RewardActionItem & {
        status: 'QUEUED' | 'ASSIGNED';
      };
    }
  | {
      kind: 'paid';
      receipt: RewardReceipt;
    }
  | {
      kind: 'auth_invalid';
    }
  | {
      kind: 'unknown';
    };

function normalizeInviteCode(inviteCode: string): string {
  return inviteCode.trim().toUpperCase();
}

export function notifyRewardClaimUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(REWARD_CLAIM_UPDATED_EVENT));
}

async function readRewardActions(
  inviteCode: string,
): Promise<RewardClaimLiveState | null> {
  try {
    const response = await fetch('/api/notifications/reward-actions', {
      cache: 'no-store',
    });

    if (response.status === 401 || response.status === 403) {
      return { kind: 'auth_invalid' };
    }

    if (!response.ok) return null;

    const body = (await response.json()) as RewardActionResponse;
    const normalized = normalizeInviteCode(inviteCode);
    const action = (body.actions ?? []).find(
      (candidate) => normalizeInviteCode(candidate.inviteCode) === normalized,
    );

    if (!action) return null;
    if (action.status === 'AWAITING_CLAIM') {
      return { kind: 'awaiting', action };
    }
    if (action.status === 'QUEUED' || action.status === 'ASSIGNED') {
      return {
        kind: 'processing',
        action: {
          ...action,
          status: action.status,
        },
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function readRewardReceipt(
  inviteCode: string,
): Promise<RewardClaimLiveState | null> {
  try {
    const response = await fetch('/api/rewards/receipts?limit=50', {
      cache: 'no-store',
    });

    if (response.status === 401 || response.status === 403) {
      return { kind: 'auth_invalid' };
    }

    if (!response.ok) return null;

    const body = (await response.json()) as RewardReceiptResponse;
    const normalized = normalizeInviteCode(inviteCode);
    const receipt = (body.receipts ?? []).find(
      (candidate) => normalizeInviteCode(candidate.inviteCode) === normalized,
    );

    return receipt ? { kind: 'paid', receipt } : null;
  } catch {
    return null;
  }
}

export async function readRewardClaimLiveState(
  inviteCode: string,
): Promise<RewardClaimLiveState> {
  const actionState = await readRewardActions(inviteCode);
  if (actionState) return actionState;

  const receiptState = await readRewardReceipt(inviteCode);
  if (receiptState) return receiptState;

  return { kind: 'unknown' };
}
