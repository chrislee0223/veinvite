import type {
  RewardActionItem,
  RewardActionResponse,
} from '@/lib/notifications/rewardAction';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

export const REWARD_CLAIM_UPDATED_EVENT =
  'veinvite-reward-claim-updated';

const AMBIGUOUS_CLAIM_RECHECK_DELAYS_MS = [0, 700, 1_800] as const;

type RewardReceiptResponse = {
  receipts?: RewardReceipt[];
  error?: string;
};

export type RewardClaimAuthoritativeState =
  | {
      kind: 'AWAITING_CLAIM';
      action: RewardActionItem;
    }
  | {
      kind: 'PROCESSING';
      action: RewardActionItem;
    }
  | {
      kind: 'PAID';
      receipt: RewardReceipt;
    }
  | {
      kind: 'UNRESOLVED';
    };

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function readRewardActions(): Promise<RewardActionItem[]> {
  const response = await fetch('/api/notifications/reward-actions', {
    cache: 'no-store',
  });
  const body = (await response.json()) as RewardActionResponse;

  if (!response.ok) {
    throw new Error(
      body.error ?? 'Reward claim state could not be loaded.',
    );
  }

  return body.actions ?? [];
}

async function readRewardReceipts(): Promise<RewardReceipt[]> {
  const response = await fetch('/api/rewards/receipts?limit=50', {
    cache: 'no-store',
  });
  const body = (await response.json()) as RewardReceiptResponse;

  if (!response.ok) {
    throw new Error(
      body.error ?? 'Reward receipt state could not be loaded.',
    );
  }

  return body.receipts ?? [];
}

export async function readRewardClaimAuthoritativeState(
  inviteCode: string,
): Promise<RewardClaimAuthoritativeState> {
  const actions = await readRewardActions();
  const action = actions.find(
    (candidate) => candidate.inviteCode === inviteCode,
  );

  if (action?.status === 'AWAITING_CLAIM') {
    return {
      kind: 'AWAITING_CLAIM',
      action,
    };
  }

  if (
    action?.status === 'QUEUED' ||
    action?.status === 'ASSIGNED'
  ) {
    return {
      kind: 'PROCESSING',
      action,
    };
  }

  const receipts = await readRewardReceipts();
  const receipt = receipts.find(
    (candidate) => candidate.inviteCode === inviteCode,
  );

  if (receipt) {
    return {
      kind: 'PAID',
      receipt,
    };
  }

  return {
    kind: 'UNRESOLVED',
  };
}

export async function reconcileAmbiguousRewardClaim(
  inviteCode: string,
): Promise<RewardClaimAuthoritativeState> {
  let lastState: RewardClaimAuthoritativeState | null = null;
  let lastError: unknown = null;

  for (const delayMs of AMBIGUOUS_CLAIM_RECHECK_DELAYS_MS) {
    await sleep(delayMs);

    try {
      const state = await readRewardClaimAuthoritativeState(inviteCode);
      lastState = state;
      lastError = null;

      if (
        state.kind === 'PROCESSING' ||
        state.kind === 'PAID'
      ) {
        return state;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastState) {
    return lastState;
  }

  throw (
    lastError instanceof Error
      ? lastError
      : new Error('Reward claim state could not be verified.')
  );
}

export function dispatchRewardClaimUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(REWARD_CLAIM_UPDATED_EVENT));
}
