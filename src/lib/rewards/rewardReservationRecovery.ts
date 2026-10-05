import 'server-only';

import {
  readStaleEligibleRewardReservationLiveness,
  reserveEligibleReferralRewards,
  type RewardReservationSweepResult,
} from '@/lib/rewards/rewardReservation';

export type RewardReservationRecoverySweep =
  RewardReservationSweepResult;

export type RewardReservationRecoveryResult = {
  reservation:
    RewardReservationRecoverySweep | null;
  failure: unknown | null;
  errors: string[];
};

export async function runRewardReservationRecovery(): Promise<RewardReservationRecoveryResult> {
  let reservation:
    RewardReservationRecoverySweep | null =
      null;
  let failure: unknown | null = null;
  const errors: string[] = [];

  try {
    reservation =
      await reserveEligibleReferralRewards();
  } catch (error) {
    failure ??= error;
    console.error(
      'Vote watcher reward reservation recovery failed:',
      error,
    );
    errors.push(
      'REWARD_RESERVATION_RECOVERY_FAILED',
    );
  }

  try {
    const liveness =
      await readStaleEligibleRewardReservationLiveness(
        15,
      );

    if (liveness.missingCount > 0) {
      const livenessError =
        new Error(
          `CLEAR reward reservation liveness failed for ${liveness.missingCount} referral(s).`,
        );
      failure ??= livenessError;
      console.error(
        'Vote watcher reward reservation liveness failed:',
        liveness,
      );
      errors.push(
        'REWARD_RESERVATION_LIVENESS_FAILED',
      );
    }
  } catch (error) {
    failure ??= error;
    console.error(
      'Vote watcher reward reservation liveness check failed:',
      error,
    );
    errors.push(
      'REWARD_RESERVATION_LIVENESS_CHECK_FAILED',
    );
  }

  return {
    reservation,
    failure,
    errors,
  };
}
