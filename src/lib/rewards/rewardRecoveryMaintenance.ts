import 'server-only';

import { retryAdmissionGuaranteesAfterFinality } from '@/lib/rewards/admissionGuaranteeRecovery';

import {
  runRewardReservationRecovery,
  type RewardReservationRecoverySweep,
} from '@/lib/rewards/rewardReservationRecovery';
import {
  runRewardXPromotionShadowAudit,
  runRewardXPromotionShadowSync,
} from '@/lib/rewards/rewardXPromotionShadow';

export type RewardRecoveryMaintenanceSweep =
  RewardReservationRecoverySweep;

export type RewardRecoveryMaintenanceResult = {
  reservation:
    RewardRecoveryMaintenanceSweep | null;
  failure: unknown | null;
  errors: string[];
};

export async function runRewardRecoveryMaintenance():
Promise<RewardRecoveryMaintenanceResult> {
  const rewardRecovery =
    await runRewardReservationRecovery();
  try {
    const admission = await retryAdmissionGuaranteesAfterFinality();
    if (admission.held > 0 || admission.errors > 0) {
      console.info('Admission finality retry batch:', admission);
    }
  } catch (error) {
    // The opt-in minimum is non-authoritative until funded. Never disrupt
    // existing Claim, Sybil, X, or canonical reservation recovery.
    console.error('Admission finality recovery deferred:', error);
  }
  try {
    const shadowSync =
      await runRewardXPromotionShadowSync(250);

    if (shadowSync.enabled) {
      const shadowAudit =
        await runRewardXPromotionShadowAudit();

      if (!shadowAudit.ok) {
        console.warn(
          'X promotion shadow audit reported invariant violations:',
          {
            network: shadowAudit.network,
            policyVersion:
              shadowAudit.policyVersion,
            violations:
              shadowAudit.violations,
          },
        );
      }
    }
  } catch (error) {
    // Shadow accounting is non-authoritative. It must never poison the
    // existing reward reservation recovery result.
    console.error(
      'X promotion shadow sync/audit failed:',
      error,
    );
  }

  return {
    reservation:
      rewardRecovery.reservation,
    failure:
      rewardRecovery.failure,
    errors:
      rewardRecovery.errors,
  };
}
