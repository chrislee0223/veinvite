import { handleCallback } from '@vercel/queue';

import {
  isSybilV2EvidenceMessage,
} from '@/lib/sybil/v2/evidenceQueue';
import {
  collectSybilV2EvidenceForInvite,
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
