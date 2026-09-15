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

function sameInviteCode(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
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
      // The action endpoint intentionally omits finalized PAID rewards. ABSENT
      // therefore means the old AWAITING_CLAIM state is no longer authoritative;
      // callers should refresh receipts/invites instead of blindly re-posting Claim.
      return { kind: 'ABSENT' };
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
