import { handleCallback } from '@vercel/queue';

import {
  isSybilV2EvidenceMessage,
} from '@/lib/sybil/v2/evidenceQueue';
import {
  assessSybilV2EarlyReferral,
  collectSybilV2EvidenceForInvite,
  runSybilV2AssessmentBatch,
  runSybilV2EarlyAssessmentBatch,
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

    // Assess the just-scanned referral first so a strong historical
    // cluster can open HOLD during ACTIVATING, well before reward readiness.
    // PAID/Claim-ready rows are excluded by the service-only early candidate
    // view, so historical backfill remains observation-only.
    await assessSybilV2EarlyReferral(
      message.inviteCode,
    );

    // New peer evidence can strengthen the same app/sink/funder cluster for
    // other active referrals. Reassess a bounded peer batch immediately, then
    // keep the final reward gate as a separate stage.
    await runSybilV2EarlyAssessmentBatch(10);
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
