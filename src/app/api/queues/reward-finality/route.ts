import { handleCallback } from '@vercel/queue';

import {
  runImmediateClaimRewardPayout,
} from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import {
  isClaimPayoutContinuationMessage,
  needsDurableClaimPayoutContinuation,
  readClaimPayoutManualIntervention,
} from '@/lib/rewards/claimPayoutContinuationQueue';

/**
 * Vercel invokes this route only through the Queue push consumer configured in
 * vercel.json. Delivery is at-least-once, so every iteration intentionally
 * delegates to the existing idempotent payout worker and immutable transaction
 * journal rather than creating a second transfer path.
 */
const queueCallback = handleCallback(
  async (message, metadata) => {
    if (!isClaimPayoutContinuationMessage(message)) {
      // A malformed message can never become valid by retrying. Acknowledge it
      // after recording enough context for operators to investigate.
      console.error(
        'Ignoring malformed reward payout continuation message:',
        {
          messageId: metadata.messageId,
          deliveryCount: metadata.deliveryCount,
        },
      );
      return;
    }

    const maxSettlementPasses = 6;

    for (let pass = 0; pass < maxSettlementPasses; pass += 1) {
      const result = await runImmediateClaimRewardPayout();
      const manualIntervention =
        readClaimPayoutManualIntervention(result);

      if (manualIntervention) {
        // Repeating a deterministic safety stop cannot repair it and can create
        // noisy queue churn. Prefer the submitted-recovery safety observation when
        // present so a later IDLE/PAID transfer result cannot hide it.
        console.error(
          'Reward payout continuation requires manual intervention:',
          {
            inviteCode: message.inviteCode,
            roundId: manualIntervention.roundId,
            manifestId: manualIntervention.manifestId,
            txId: manualIntervention.txId,
            reason: manualIntervention.reason ?? null,
          },
        );
        return;
      }

      const recoveredPaidRound =
        result.submittedRecovery?.status === 'PAID';
      const transferWorkerSettledOrIdle =
        (
          result.status === 'IDLE' ||
          result.status === 'PAID'
        ) &&
        (result.queuedCount ?? 0) === 0;

      if (recoveredPaidRound && transferWorkerSettledOrIdle) {
        // One immutable submitted round was just finalized and no queued Claim
        // remains behind the transfer worker. Continue within the same Queue
        // delivery so a group of already-finalized payouts is not forced to wait
        // for separate redeliveries one round at a time.
        continue;
      }

      if (needsDurableClaimPayoutContinuation(result)) {
        // Throwing tells Vercel Queues not to acknowledge the message. The same
        // deployment receives it again after the retry delay. Existing payout
        // locks, manifests, signed-transaction journals and settlement RPCs make
        // this safe under at-least-once delivery.
        throw new Error(
          `Reward payout continuation remains pending: ${result.status}`,
        );
      }

      return;
    }

    // Keep the Queue message alive if an unusually large finalized backlog was
    // drained up to the bounded per-delivery limit. The next delivery continues
    // from the same immutable journals without ever creating a duplicate payout.
    throw new Error(
      'Reward payout continuation reached its bounded settlement-drain limit.',
    );
  },
  {
    visibilityTimeoutSeconds: 180,
    retry: (_error, metadata) => {
      const exponent = Math.max(
        0,
        Math.min(metadata.deliveryCount - 1, 5),
      );
      return {
        afterSeconds: Math.min(
          300,
          15 * (2 ** exponent),
        ),
      };
    },
  },
);

// @vercel/queue deliberately accepts either a Web Request or the platform's
// wrapped callback event. Next.js 16 route generation only permits a plain
// Request parameter, so keep the Queue callback behind this narrow adapter.
export function POST(request: Request) {
  return queueCallback(request);
}