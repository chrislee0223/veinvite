import 'server-only';

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
  warnings: string[];
};

export async function runRewardRecoveryMaintenance():
Promise<RewardRecoveryMaintenanceResult> {
  const rewardRecovery =
    await runRewardReservationRecovery();
  const warnings: string[] = [];

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
        warnings.push(
          'X_PROMOTION_SHADOW_AUDIT_VIOLATION',
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
    warnings.push(
      'X_PROMOTION_SHADOW_SYNC_FAILED',
    );
  }

  return {
    reservation:
      rewardRecovery.reservation,
    failure:
      rewardRecovery.failure,
    errors:
      rewardRecovery.errors,
    warnings,
  };
}
