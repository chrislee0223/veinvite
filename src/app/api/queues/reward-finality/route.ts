import { handleCallback } from '@vercel/queue';

import {
  runImmediateClaimRewardPayout,
} from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import {
  isClaimPayoutContinuationMessage,
  needsDurableClaimPayoutContinuation,
} from '@/lib/rewards/claimPayoutContinuationQueue';

/**
 * Vercel invokes this route only through the Queue push consumer configured in
 * vercel.json. Delivery is at-least-once, so every iteration intentionally
 * delegates to the existing idempotent payout worker and immutable transaction
 * journal rather than creating a second transfer path.
 */
export const POST = handleCallback(
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

    const result = await runImmediateClaimRewardPayout();

    if (result.status === 'MANUAL_INTERVENTION_REQUIRED') {
      // Repeating a deterministic safety stop cannot repair it and can create
      // noisy queue churn. The immutable journal remains available for manual
      // reconciliation and the daily recovery sweep stays as a separate guard.
      console.error(
        'Reward payout continuation requires manual intervention:',
        {
          inviteCode: message.inviteCode,
          roundId: result.roundId,
          manifestId: result.manifestId,
          txId: result.txId,
          reason: result.reason ?? null,
        },
      );
      return;
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
