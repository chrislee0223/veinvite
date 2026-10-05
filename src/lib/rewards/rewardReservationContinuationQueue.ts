import 'server-only';

import { send } from '@vercel/queue';

export const REWARD_RESERVATION_CONTINUATION_TOPIC =
  'veinvite-reward-reservation-finality';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const MESSAGE_RETENTION_SECONDS = 86_400;

export type RewardReservationContinuationTrigger =
  | 'ELIGIBILITY'
  | 'SYBIL_CLEARANCE';

export type RewardReservationContinuationMessage = {
  inviteCode: string;
  detectedAt: string;
  trigger?: RewardReservationContinuationTrigger;
  assessmentRevision?: number;
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
  const trigger = candidate.trigger;
  const assessmentRevision =
    candidate.assessmentRevision;

  const legacyMessage =
    trigger === undefined &&
    assessmentRevision === undefined;
  const eligibilityMessage =
    trigger === 'ELIGIBILITY' &&
    assessmentRevision === undefined;
  const clearanceMessage =
    trigger === 'SYBIL_CLEARANCE' &&
    typeof assessmentRevision === 'number' &&
    Number.isSafeInteger(assessmentRevision) &&
    assessmentRevision >= 1;

  return (
    typeof candidate.inviteCode === 'string' &&
    INVITE_CODE_PATTERN.test(candidate.inviteCode) &&
    typeof candidate.detectedAt === 'string' &&
    !Number.isNaN(Date.parse(candidate.detectedAt)) &&
    (
      legacyMessage ||
      eligibilityMessage ||
      clearanceMessage
    )
  );
}

export async function enqueueRewardReservationContinuation({
  inviteCode,
  detectedAt,
  trigger = 'ELIGIBILITY',
  assessmentRevision,
}: RewardReservationContinuationMessage): Promise<{
  messageId: string | null;
}> {
  const payload: RewardReservationContinuationMessage = {
    inviteCode: inviteCode.trim().toUpperCase(),
    detectedAt,
    trigger,
    ...(assessmentRevision === undefined
      ? {}
      : { assessmentRevision }),
  };

  if (!isRewardReservationContinuationMessage(payload)) {
    throw new Error(
      'Reward reservation continuation received invalid metadata.',
    );
  }

  const idempotencySuffix =
    payload.trigger === 'SYBIL_CLEARANCE'
      ? `clearance-${payload.assessmentRevision}`
      : 'eligibility';

  const { messageId } = await send(
    REWARD_RESERVATION_CONTINUATION_TOPIC,
    payload,
    {
      delaySeconds: 5,
      idempotencyKey:
        `veinvite-reservation-${payload.inviteCode}-${idempotencySuffix}`,
      retentionSeconds:
        MESSAGE_RETENTION_SECONDS,
    },
  );

  return { messageId };
}
