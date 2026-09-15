import 'server-only';

import { send } from '@vercel/queue';

import type {
  AutomaticRewardPayoutResult,
} from '@/lib/rewards/automaticRewardPayoutWithMnemonic';

export const CLAIM_PAYOUT_CONTINUATION_TOPIC =
  'veinvite-reward-finality';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const CLAIM_PAYOUT_MESSAGE_RETENTION_SECONDS = 86_400;

export type ClaimPayoutContinuationMessage = {
  inviteCode: string;
  requestedAt: string;
};

export function isClaimPayoutContinuationMessage(
  value: unknown,
): value is ClaimPayoutContinuationMessage {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const inviteCode = candidate.inviteCode;
  const requestedAt = candidate.requestedAt;

  return (
    typeof inviteCode === 'string' &&
    INVITE_CODE_PATTERN.test(inviteCode) &&
    typeof requestedAt === 'string' &&
    !Number.isNaN(Date.parse(requestedAt))
  );
}

/**
 * Claim eligibility is decided before AWAITING_CLAIM is exposed. This helper
 * answers only whether the already-approved transfer state still needs a
 * durable worker invocation after the synchronous Claim kickoff.
 */
export function needsDurableClaimPayoutContinuation(
  result: AutomaticRewardPayoutResult | null,
): boolean {
  if (!result) {
    return true;
  }

  if (
    result.status === 'LOCKED' ||
    result.status === 'PREPARED' ||
    result.status === 'SUBMITTED' ||
    result.status === 'WAITING_FINALITY'
  ) {
    return true;
  }

  return (
    (result.queuedCount ?? 0) > 0 &&
    (
      result.status === 'IDLE' ||
      result.status === 'PAID'
    )
  );
}

function initialDelaySeconds(
  result: AutomaticRewardPayoutResult | null,
): number {
  if (
    result?.status === 'SUBMITTED' ||
    result?.status === 'WAITING_FINALITY'
  ) {
    // The transaction is already journaled/submitted. Give the chain time to
    // advance before the first durable reconciliation instead of immediately
    // repeating the same finality read performed by the Claim request.
    return 30;
  }

  // LOCKED / PREPARED / a failed synchronous kickoff should be retried quickly
  // so an approved Claim does not wait for the low-frequency recovery cron.
  return 5;
}

function idempotencyKey({
  inviteCode,
  requestedAt,
}: ClaimPayoutContinuationMessage): string {
  const requestSerial = requestedAt.replace(/\D/gu, '').slice(0, 20);
  return `veinvite-claim-${inviteCode}-${requestSerial}`;
}

export async function enqueueClaimPayoutContinuation({
  inviteCode,
  requestedAt,
  result,
}: ClaimPayoutContinuationMessage & {
  result: AutomaticRewardPayoutResult | null;
}): Promise<{
  queued: boolean;
  messageId: string | null;
}> {
  const payload: ClaimPayoutContinuationMessage = {
    inviteCode: inviteCode.trim().toUpperCase(),
    requestedAt,
  };

  if (!isClaimPayoutContinuationMessage(payload)) {
    throw new Error(
      'Claim payout continuation received invalid queue metadata.',
    );
  }

  if (!needsDurableClaimPayoutContinuation(result)) {
    return {
      queued: false,
      messageId: null,
    };
  }

  const { messageId } = await send(
    CLAIM_PAYOUT_CONTINUATION_TOPIC,
    payload,
    {
      delaySeconds: initialDelaySeconds(result),
      idempotencyKey: idempotencyKey(payload),
      retentionSeconds:
        CLAIM_PAYOUT_MESSAGE_RETENTION_SECONDS,
    },
  );

  return {
    queued: true,
    messageId,
  };
}
