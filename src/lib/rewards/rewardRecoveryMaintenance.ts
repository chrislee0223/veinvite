import 'server-only';

import { tryClaimCronJob, markCronJobSucceeded, markCronJobFailed } from '@/lib/monitoring/cronHeartbeat';
const SHADOW_AUDIT_JOB = 'vote-reconcile:x-shadow-audit';
const SHADOW_AUDIT_INTERVAL_SECONDS = 30 * 60;

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

    // Single owner: no duplicate minutely shadow projection/audit. Audit on
    // new projection or at least every 30 minutes, never as payout authority.
    if (shadowSync.enabled && await tryClaimCronJob(
      SHADOW_AUDIT_JOB, shadowSync.createdCount > 0 ? 0 : SHADOW_AUDIT_INTERVAL_SECONDS, 360,
    )) {
      try {
        const shadowAudit = await runRewardXPromotionShadowAudit();
        if (!shadowAudit.ok) {
          console.warn('X promotion shadow audit reported invariant violations:', {
            network: shadowAudit.network, policyVersion: shadowAudit.policyVersion,
            violations: shadowAudit.violations,
          });
          // Keep retry/diagnostics live without blocking authoritative recovery.
          await markCronJobFailed(SHADOW_AUDIT_JOB, 'X promotion shadow invariant violation');
        } else {
          await markCronJobSucceeded(SHADOW_AUDIT_JOB);
        }
      } catch (error) {
        await markCronJobFailed(SHADOW_AUDIT_JOB, error);
        throw error;
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
