import 'server-only';

import {
  markCronJobFailed,
  markCronJobSucceeded,
  tryClaimCronJob,
} from '@/lib/monitoring/cronHeartbeat';
import {
  syncVeInviteAllocationReceipts,
} from '@/lib/rewards/allocationAccounting';
import {
  runRewardBoostReserveRebalance,
  type RewardBoostReserveExecutionResult,
} from '@/lib/rewards/rewardBoostReserveExecution';
import {
  readRewardRuntimeSafety,
} from '@/lib/rewards/runtimeSafety';
import {
  runRewardXPromotionShadowSync,
} from '@/lib/rewards/rewardXPromotionShadow';
import {
  recoverSubmittedRewardPayout,
  type SubmittedPayoutRecoveryResult,
} from '@/lib/rewards/submittedPayoutRecovery';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

export const REWARD_BOOST_REBALANCE_INTERVAL_SECONDS =
  30 * 60;
export const SUBMITTED_PAYOUT_RECOVERY_INTERVAL_SECONDS =
  60;

const REWARD_BOOST_REBALANCE_JOB =
  'vote-reconcile:reward-boost-reserve';
const SUBMITTED_PAYOUT_RECOVERY_JOB =
  'vote-reconcile:submitted-payout-recovery';
const REWARD_BOOST_REBALANCE_LEASE_SECONDS = 180;
const SUBMITTED_PAYOUT_RECOVERY_LEASE_SECONDS = 180;

export type ScheduledRewardBoostReserveResult = {
  claimed: boolean;
  allocationSync: {
    network: string;
    insertedCount: number;
    latestVeBetterRoundId: string | null;
  } | null;
  reserve: RewardBoostReserveExecutionResult | null;
  skippedReason: 'RUNTIME_CLOSED' | null;
  error: string | null;
};

export async function runScheduledRewardBoostReserveRebalance():
Promise<ScheduledRewardBoostReserveResult> {
  let claimed = false;

  try {
    claimed =
      await tryClaimCronJob(
        REWARD_BOOST_REBALANCE_JOB,
        REWARD_BOOST_REBALANCE_INTERVAL_SECONDS,
        REWARD_BOOST_REBALANCE_LEASE_SECONDS,
      );
  } catch (error) {
    console.error(
      'Reward boost reserve cadence claim failed:',
      error,
    );

    return {
      claimed: false,
      allocationSync: null,
      reserve: null,
      skippedReason: null,
      error:
        'REWARD_BOOST_RESERVE_CADENCE_CLAIM_FAILED',
    };
  }

  if (!claimed) {
    return {
      claimed: false,
      allocationSync: null,
      reserve: null,
      skippedReason: null,
      error: null,
    };
  }

  try {
    const runtime =
      await readRewardRuntimeSafety();
    const { network } =
      getVeBetterNetworkConfig();

    if (
      runtime.emergencyRewardsPaused ||
      (
        network === 'mainnet' &&
        !runtime.mainnetFundedRewardsEnabled
      )
    ) {
      await markCronJobSucceeded(
        REWARD_BOOST_REBALANCE_JOB,
      );

      return {
        claimed: true,
        allocationSync: null,
        reserve: null,
        skippedReason: 'RUNTIME_CLOSED',
        error: null,
      };
    }

    // Finalized AllocationRewardsClaimed evidence defines the reward cohort.
    // Sync it immediately before rebalancing so a newly opened VeBetterDAO
    // round is protected/boosted without waiting for the daily cron.
    const allocation =
      await syncVeInviteAllocationReceipts();
    const reserve =
      await runRewardBoostReserveRebalance();

    await markCronJobSucceeded(
      REWARD_BOOST_REBALANCE_JOB,
    );

    return {
      claimed: true,
      allocationSync: {
        network: allocation.network,
        insertedCount: allocation.insertedCount,
        latestVeBetterRoundId:
          allocation.latestReceipt
            ?.vebetter_round_id ?? null,
      },
      reserve,
      skippedReason: null,
      error: null,
    };
  } catch (error) {
    console.error(
      'Reward boost reserve scheduled rebalance failed:',
      error,
    );

    try {
      await markCronJobFailed(
        REWARD_BOOST_REBALANCE_JOB,
        error,
      );
    } catch (heartbeatError) {
      console.error(
        'Reward boost reserve heartbeat failure:',
        heartbeatError,
      );
    }

    return {
      claimed: true,
      allocationSync: null,
      reserve: null,
      skippedReason: null,
      error:
        'REWARD_BOOST_RESERVE_REBALANCE_FAILED',
    };
  }
}


export type ScheduledSubmittedPayoutRecoveryResult = {
  claimed: boolean;
  recovery: SubmittedPayoutRecoveryResult | null;
  error: string | null;
};

export async function runScheduledSubmittedPayoutRecovery():
Promise<ScheduledSubmittedPayoutRecoveryResult> {
  let claimed = false;

  try {
    claimed = await tryClaimCronJob(
      SUBMITTED_PAYOUT_RECOVERY_JOB,
      SUBMITTED_PAYOUT_RECOVERY_INTERVAL_SECONDS,
      SUBMITTED_PAYOUT_RECOVERY_LEASE_SECONDS,
    );
  } catch (error) {
    console.error(
      'Submitted payout recovery cadence claim failed:',
      error,
    );
    return {
      claimed: false,
      recovery: null,
      error:
        'SUBMITTED_PAYOUT_RECOVERY_CADENCE_CLAIM_FAILED',
    };
  }

  if (!claimed) {
    return {
      claimed: false,
      recovery: null,
      error: null,
    };
  }

  try {
    const recovery =
      await recoverSubmittedRewardPayout();

    if (
      recovery.status ===
      'MANUAL_INTERVENTION_REQUIRED'
    ) {
      const interventionError =
        new Error(
          recovery.reason ??
            'Submitted payout requires manual intervention.',
        );

      await markCronJobFailed(
        SUBMITTED_PAYOUT_RECOVERY_JOB,
        interventionError,
      );

      return {
        claimed: true,
        recovery,
        error:
          'SUBMITTED_PAYOUT_RECOVERY_MANUAL_INTERVENTION',
      };
    }

    await markCronJobSucceeded(
      SUBMITTED_PAYOUT_RECOVERY_JOB,
    );

    return {
      claimed: true,
      recovery,
      error: null,
    };
  } catch (error) {
    console.error(
      'Submitted payout scheduled recovery failed:',
      error,
    );

    try {
      await markCronJobFailed(
        SUBMITTED_PAYOUT_RECOVERY_JOB,
        error,
      );
    } catch (heartbeatError) {
      console.error(
        'Submitted payout recovery heartbeat failure:',
        heartbeatError,
      );
    }

    return {
      claimed: true,
      recovery: null,
      error:
        'SUBMITTED_PAYOUT_RECOVERY_FAILED',
    };
  }
}

export type ScheduledRewardMaintenanceResult = {
  submittedPayout:
    ScheduledSubmittedPayoutRecoveryResult;
  reserve:
    ScheduledRewardBoostReserveResult;
  errors: string[];
};

export async function runScheduledRewardMaintenance():
Promise<ScheduledRewardMaintenanceResult> {
  const submittedPayout =
    await runScheduledSubmittedPayoutRecovery();
  const reserve =
    await runScheduledRewardBoostReserveRebalance();

  try {
    await runRewardXPromotionShadowSync(
      50,
    );
  } catch (error) {
    // Shadow projection is observability only. Never let it fail or delay
    // authoritative reward maintenance.
    console.warn(
      'X promotion shadow sync failed:',
      error,
    );
  }

  return {
    submittedPayout,
    reserve,
    errors: [
      submittedPayout.error,
      reserve.error,
    ].filter(
      (value): value is string =>
        typeof value === 'string',
    ),
  };
}
