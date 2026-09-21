import 'server-only';

import { send } from '@vercel/queue';

export const REWARD_RESERVATION_CONTINUATION_TOPIC =
  'veinvite-reward-reservation-finality';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const MESSAGE_RETENTION_SECONDS = 86_400;

export type RewardReservationContinuationMessage = {
  inviteCode: string;
  detectedAt: string;
};

export function isRewardReservationContinuationMessage(
  value: unknown,
): value is RewardReservationContinuationMessage {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
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

export async function enqueueRewardReservationContinuation({
  inviteCode,
  detectedAt,
}: RewardReservationContinuationMessage): Promise<{
  messageId: string;
}> {
  const payload: RewardReservationContinuationMessage = {
    inviteCode: inviteCode.trim().toUpperCase(),
    detectedAt,
  };

  if (!isRewardReservationContinuationMessage(payload)) {
    throw new Error(
      'Reward reservation continuation received invalid metadata.',
    );
  }

  const { messageId } = await send(
    REWARD_RESERVATION_CONTINUATION_TOPIC,
    payload,
    {
      delaySeconds: 5,
      idempotencyKey:
        `veinvite-reservation-${payload.inviteCode}`,
      retentionSeconds:
        MESSAGE_RETENTION_SECONDS,
    },
  );

  return { messageId };
}
