import 'server-only';

import { send } from '@vercel/queue';

export const SYBIL_V2_EVIDENCE_TOPIC =
  'veinvite-sybil-v2-evidence';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const MESSAGE_RETENTION_SECONDS = 86_400;

export type SybilV2EvidenceMessage = {
  inviteCode: string;
  detectedAt: string;
};

export function isSybilV2EvidenceMessage(
  value: unknown,
): value is SybilV2EvidenceMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.inviteCode === 'string' &&
    INVITE_CODE_PATTERN.test(candidate.inviteCode) &&
    typeof candidate.detectedAt === 'string' &&
    !Number.isNaN(Date.parse(candidate.detectedAt))
  );
}

export async function enqueueSybilV2EvidenceCollection({
  inviteCode,
  detectedAt,
}: SybilV2EvidenceMessage): Promise<{
  messageId: string | null;
}> {
  const payload: SybilV2EvidenceMessage = {
    inviteCode: inviteCode.trim().toUpperCase(),
    detectedAt,
  };

  if (!isSybilV2EvidenceMessage(payload)) {
    throw new Error('Sybil v2 evidence queue received invalid metadata.');
  }

  const { messageId } = await send(
    SYBIL_V2_EVIDENCE_TOPIC,
    payload,
    {
      delaySeconds: 1,
      idempotencyKey:
        `veinvite-sybil-v2-evidence-${payload.inviteCode}`,
      retentionSeconds: MESSAGE_RETENTION_SECONDS,
    },
  );

  return { messageId };
}
