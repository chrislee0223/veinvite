import type {
  RewardActionItem,
  RewardActionResponse,
} from '@/lib/notifications/rewardAction';

export const REWARD_CLAIM_UPDATED_EVENT =
  'veinvite-reward-claim-updated';

export type RewardClaimClientResult =
  | { outcome: 'ACCEPTED' }
  | { outcome: 'PROCESSING'; action: RewardActionItem }
  | { outcome: 'AWAITING'; error: string | null }
  | { outcome: 'AUTH_ERROR'; error: string | null }
  | { outcome: 'REJECTED'; error: string | null }
  | { outcome: 'UNKNOWN'; error: string | null };

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function reconcileClaimOutcome(
  inviteCode: string,
  originalError: string | null,
): Promise<RewardClaimClientResult> {
  try {
    const response = await fetch('/api/notifications/reward-actions', {
      cache: 'no-store',
    });
    const body = await readJson<RewardActionResponse>(response);

    if (response.status === 401 || response.status === 403) {
      return {
        outcome: 'AUTH_ERROR',
        error: body?.error ?? originalError,
      };
    }
    if (!response.ok || !body) {
      return { outcome: 'UNKNOWN', error: originalError };
    }

    const action = (body.actions ?? []).find(
      (candidate) => candidate.inviteCode === inviteCode,
    );
    if (!action) {
      // PAID rewards intentionally disappear from reward-actions. Other final
      // states can disappear too, so absence is not proof of payment or
      // failure. Let the authoritative Home/receipt refresh resolve it.
      return { outcome: 'UNKNOWN', error: originalError };
    }
    if (action.status === 'QUEUED' || action.status === 'ASSIGNED') {
      return { outcome: 'PROCESSING', action };
    }

    return { outcome: 'AWAITING', error: originalError };
  } catch {
    return { outcome: 'UNKNOWN', error: originalError };
  }
}

export async function requestRewardClaim(
  inviteCode: string,
): Promise<RewardClaimClientResult> {
  let response: Response;

  try {
    response = await fetch('/api/rewards/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode }),
    });
  } catch {
    return reconcileClaimOutcome(inviteCode, null);
  }

  const body = await readJson<{
    claim?: { status?: string };
    error?: string;
  }>(response);

  if (response.ok) {
    // The Claim route returns success only after request_reward_claim has
    // durably moved the reservation into the payout queue. The payout itself
    // may still be pending finality, so this is ACCEPTED rather than PAID.
    return { outcome: 'ACCEPTED' };
  }

  const error = body?.error ?? null;
  if (response.status === 401 || response.status === 403) {
    return { outcome: 'AUTH_ERROR', error };
  }

  if (response.status === 409 || response.status >= 500) {
    // A second tab can see 409 after the first tab already queued the Claim,
    // and a 5xx/network boundary can leave the client unsure whether the DB
    // commit happened. Re-read wallet-scoped server state before telling the
    // user the Claim failed.
    return reconcileClaimOutcome(inviteCode, error);
  }

  return { outcome: 'REJECTED', error };
}

export function publishRewardClaimUpdated(): void {
  window.dispatchEvent(new Event(REWARD_CLAIM_UPDATED_EVENT));
}
