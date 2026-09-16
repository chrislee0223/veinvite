import 'server-only';

import { send } from '@vercel/queue';

import type {
  AutomaticRewardPayoutResult,
} from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import type {
  SubmittedPayoutRecoveryResult,
} from '@/lib/rewards/submittedPayoutRecovery';

export const CLAIM_PAYOUT_CONTINUATION_TOPIC =
  'veinvite-reward-finality';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const CLAIM_PAYOUT_MESSAGE_RETENTION_SECONDS = 86_400;

export type ClaimPayoutContinuationMessage = {
  inviteCode: string;
  requestedAt: string;
};

type RecoveryAwarePayoutResult =
  AutomaticRewardPayoutResult & {
    submittedRecovery?: SubmittedPayoutRecoveryResult | null;
    submittedRecoveryFailed?: boolean;
  };

export type ClaimPayoutManualIntervention = {
  roundId: string | null;
  manifestId: string | null;
  txId: string | null;
  reason?: string;
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

export function readClaimPayoutManualIntervention(
  result: AutomaticRewardPayoutResult | null,
): ClaimPayoutManualIntervention | null {
  if (!result) {
    return null;
  }

  if (result.status === 'MANUAL_INTERVENTION_REQUIRED') {
    return {
      roundId: result.roundId,
      manifestId: result.manifestId,
      txId: result.txId,
      reason: result.reason,
    };
  }

  const recovery =
    (result as RecoveryAwarePayoutResult).submittedRecovery;

  if (recovery?.status !== 'MANUAL_INTERVENTION_REQUIRED') {
    return null;
  }

  return {
    roundId: recovery.roundId,
    manifestId: recovery.manifestId,
    txId: recovery.txId,
    reason: recovery.reason,
  };
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

  // Deterministic journal/safety conflicts are intentionally not retried by the
  // Queue. They remain loud operator work and must take precedence over any
  // later IDLE/PAID transfer-only result from the same invocation.
  if (readClaimPayoutManualIntervention(result)) {
    return false;
  }

  const recoveryAware = result as RecoveryAwarePayoutResult;

  // A transient failure while checking an older submitted transaction must not
  // be erased by a successful/idle newer Claim pass. Keep redelivery alive until
  // that older journaled transaction can be observed safely again.
  if (recoveryAware.submittedRecoveryFailed === true) {
    return true;
  }

  if (
    recoveryAware.submittedRecovery?.status === 'LOCKED' ||
    recoveryAware.submittedRecovery?.status === 'WAITING_FINALITY'
  ) {
    return true;
  }

  if (
    result.status === 'DISABLED' ||
    result.status === 'NOT_CONFIGURED' ||
    result.status === 'NOT_REGISTERED' ||
    result.status === 'LOCKED' ||
    result.status === 'PREPARED' ||
    result.status === 'SUBMITTED' ||
    result.status === 'WAITING_FINALITY'
  ) {
    // An explicit Claim is already durable DB state. Temporary operational
    // stops must not strand it until the once-daily recovery sweep; keep the
    // Queue lease alive so the same approved transfer resumes when safe.
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
  const recovery = result
    ? (result as RecoveryAwarePayoutResult).submittedRecovery
    : null;

  if (
    result?.status === 'SUBMITTED' ||
    result?.status === 'WAITING_FINALITY' ||
    recovery?.status === 'WAITING_FINALITY'
  ) {
    // The transaction is already journaled/submitted. Give the chain time to
    // advance before the first durable reconciliation instead of immediately
    // repeating the same finality read performed by the Claim request.
    return 30;
  }

  // LOCKED / PREPARED / temporary operational stops / a failed synchronous
  // kickoff should be retried quickly so an approved Claim does not wait for
  // the low-frequency recovery cron.
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