import 'server-only';

import {
  enqueueRewardReservationContinuation,
} from '@/lib/rewards/rewardReservationContinuationQueue';
import {
  ensureSybilV2ReadyForReward,
} from '@/lib/sybil/v2/pipeline';
import {
  isSybilV2EnforcementEnabled,
} from '@/lib/sybil/v2/rollout';

export async function continueRewardReservationAfterEligibility(
  inviteCode: string,
): Promise<void> {
  const detectedAt =
    new Date().toISOString();
  let eligibilityContinuationPublished =
    false;

  // Eligibility itself is durable. Publish the reservation continuation
  // immediately even when Sybil finality/clearance is still catching up.
  // The queue consumer remains fail-closed until every security gate is ready.
  try {
    await enqueueRewardReservationContinuation({
      inviteCode,
      detectedAt,
      trigger: 'ELIGIBILITY',
    });
    eligibilityContinuationPublished =
      true;
  } catch (reservationError) {
    console.error(
      'Reward reservation eligibility continuation could not be published:',
      {
        inviteCode,
        error: reservationError,
      },
    );
  }

  let sybilV2Enforced = true;

  try {
    sybilV2Enforced =
      await isSybilV2EnforcementEnabled();

    const sybilV2 =
      await ensureSybilV2ReadyForReward(
        inviteCode,
      );

    const v2Ready =
      (sybilV2.state === 'CLEAR' ||
        sybilV2.state === 'WATCH') &&
      sybilV2.clearanceIssued;

    if (sybilV2Enforced && !v2Ready) {
      console.warn(
        'Reward reservation waiting for Sybil v2 clearance:',
        {
          inviteCode,
          state: sybilV2.state,
          riskScore: sybilV2.riskScore,
          reasonCodes: sybilV2.reasonCodes,
        },
      );
    }
  } catch (sybilV2Error) {
    if (
      !sybilV2Enforced &&
      !eligibilityContinuationPublished
    ) {
      // Shadow mode preserves the legacy continuation if the first Queue
      // publication failed. Enforcement remains fail-closed at the consumer.
      try {
        await enqueueRewardReservationContinuation({
          inviteCode,
          detectedAt,
          trigger: 'ELIGIBILITY',
        });
      } catch (reservationError) {
        console.error(
          'Legacy reward reservation queue failed during Sybil v2 shadow mode:',
          {
            inviteCode,
            error: reservationError,
          },
        );
      }
    }

    console.error(
      'Sybil v2 final assessment failed before reward reservation:',
      {
        inviteCode,
        error: sybilV2Error,
      },
    );
  }
}
