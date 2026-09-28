import { handleCallback } from '@vercel/queue';

import {
  isSybilV2EvidenceMessage,
} from '@/lib/sybil/v2/evidenceQueue';
import {
  assessSybilV2Referral,
  collectSybilV2EvidenceForInvite,
  runSybilV2AssessmentBatch,
} from '@/lib/sybil/v2/pipeline';

const queueCallback = handleCallback(
  async (message, metadata) => {
    if (!isSybilV2EvidenceMessage(message)) {
      console.error(
        'Ignoring malformed Sybil v2 evidence message:',
        {
          messageId: metadata.messageId,
          deliveryCount: metadata.deliveryCount,
        },
      );
      return;
    }

    const result = await collectSybilV2EvidenceForInvite(
      message.inviteCode,
    );

    if (
      !result.historicalChainComplete ||
      !result.fundingChainComplete
    ) {
      throw new Error(
        `Sybil v2 evidence collection incomplete for ${message.inviteCode}: ${result.error ?? 'unknown error'}`,
      );
    }

    // Assess the exact activated referral immediately. Strong adverse evidence
    // may HOLD/RESTRICT before vote completion, while incomplete later-stage
    // checks can never produce CLEAR or reward clearance.
    await assessSybilV2Referral(message.inviteCode);

    // New historical/funding evidence can strengthen an existing cluster.
    // Reassess unreserved peers immediately instead of waiting for the daily
    // recovery cron. Claim-ready rows remain protected by the reward gates.
    await runSybilV2AssessmentBatch(10);
  },
  {
    visibilityTimeoutSeconds: 240,
    retry: (_error, metadata) => {
      const exponent = Math.max(
        0,
        Math.min(metadata.deliveryCount - 1, 5),
      );

      return {
        afterSeconds: Math.min(
          300,
          10 * (2 ** exponent),
        ),
      };
    },
  },
);

export function POST(request: Request) {
  return queueCallback(request);
}
